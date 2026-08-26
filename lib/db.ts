import { Pool, types as pgTypes } from "pg";

export type QueryResult<T> = {
  rows: T[];
  rowCount: number;
};

export interface Queryable {
  query<T>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface AppDatabase extends Queryable {
  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const SCHEMA_VERSION = 2;
const SCHEMA_VERSION_TABLE = `CREATE TABLE IF NOT EXISTS twocents_schema (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL
)`;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_identities (
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (provider, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    home_currency TEXT NOT NULL DEFAULT 'INR',
    invite_code TEXT NOT NULL UNIQUE,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS household_members (
    household_id TEXT NOT NULL REFERENCES households(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (household_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🧾',
    color TEXT NOT NULL DEFAULT '#6B7A70',
    sort INTEGER NOT NULL DEFAULT 0,
    budget_minor BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS recurring_expenses (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id),
    frequency TEXT NOT NULL,
    anchor_day INTEGER NOT NULL,
    next_due_on TEXT NOT NULL,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    fx_to_home DOUBLE PRECISION NOT NULL DEFAULT 1,
    category_id TEXT REFERENCES categories(id),
    merchant TEXT,
    note TEXT,
    spent_on TEXT NOT NULL,
    spent_time TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    raw_input TEXT,
    request_id TEXT,
    recurring_rule_id TEXT,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    label TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '⚡',
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    category_id TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT 'iPhone Shortcut',
    created_at BIGINT NOT NULL,
    last_used_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    reset_at BIGINT NOT NULL
  )`,
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS spent_time TEXT",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS request_id TEXT",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_rule_id TEXT",
  "ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_minor BIGINT",
  "CREATE INDEX IF NOT EXISTS idx_recurring_hh_due ON recurring_expenses(household_id, active, next_due_on)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_hh_date ON expenses(household_id, spent_on)",
  "CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_request ON expenses(user_id, request_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_due ON expenses(recurring_rule_id, spent_on)",
] as const;

declare global {
  var __twocents_db: AppDatabase | undefined;
}

class PostgresDatabase implements AppDatabase {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    const configuredMax = Number(process.env.DATABASE_POOL_MAX ?? 5);
    const max = Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 20
      ? configuredMax
      : 5;
    this.pool = new Pool({
      connectionString,
      max,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    this.pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(SCHEMA_VERSION_TABLE);
      const current = await client.query<{ version: number }>(
        "SELECT version FROM twocents_schema WHERE name = 'app'"
      );
      if ((current.rows[0]?.version ?? 0) >= SCHEMA_VERSION) return;

      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(1968813457)");
      const lockedCurrent = await client.query<{ version: number }>(
        "SELECT version FROM twocents_schema WHERE name = 'app'"
      );
      if ((lockedCurrent.rows[0]?.version ?? 0) < SCHEMA_VERSION) {
        await initializeDatabase({
          query: async <T>(text: string, values?: readonly unknown[]) => {
            const result = await client.query(text, values as unknown[] | undefined);
            return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
          },
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async query<T>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>> {
    await this.ready;
    const result = await this.pool.query(text, values as unknown[] | undefined);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work({
        query: async <R>(text: string, values?: readonly unknown[]) => {
          const queryResult = await client.query(text, values as unknown[] | undefined);
          return { rows: queryResult.rows as R[], rowCount: queryResult.rowCount ?? 0 };
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    await this.pool.end();
  }
}

pgTypes.setTypeParser(pgTypes.builtins.INT8, (value) => Number(value));

export function db(): AppDatabase {
  if (global.__twocents_db) return global.__twocents_db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Point it at PostgreSQL before starting TwoCents."
    );
  }
  global.__twocents_db = new PostgresDatabase(connectionString);
  return global.__twocents_db;
}

export async function initializeDatabase(database: Queryable): Promise<void> {
  await database.query(SCHEMA_VERSION_TABLE);
  for (const statement of SCHEMA_STATEMENTS) {
    await database.query(statement);
  }
  await ensureHouseholdHelpCategories(database);
  await database.query(
    `INSERT INTO twocents_schema (name, version) VALUES ('app', $1)
     ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version`,
    [SCHEMA_VERSION]
  );
}

export async function ensureHouseholdHelpCategories(database: Queryable): Promise<void> {
  await database.query(
    `UPDATE categories c
     SET sort = c.sort + 1
     WHERE c.name = 'Other'
       AND NOT EXISTS (
         SELECT 1 FROM categories help
         WHERE help.household_id = c.household_id AND help.name = 'Household Help'
       )`
  );
  await database.query(
    `INSERT INTO categories (id, household_id, name, emoji, color, sort)
     SELECT 'household-help-' || h.id, h.id, 'Household Help', '🧹', '#6B7A70', 11
     FROM households h
     WHERE NOT EXISTS (
       SELECT 1 FROM categories c
       WHERE c.household_id = h.id AND c.name = 'Household Help'
     )`
  );
}

export function setDatabaseForTests(database: AppDatabase): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test databases cannot be installed in production.");
  }
  global.__twocents_db = database;
}

export async function closeDatabase(): Promise<void> {
  const database = global.__twocents_db;
  global.__twocents_db = undefined;
  if (database) await database.close();
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === "23505" && (!constraint || candidate.constraint === constraint);
}

export function uid(): string {
  return crypto.randomUUID();
}
