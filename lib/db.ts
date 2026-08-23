import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// SQLite for local/dev. The schema is plain SQL kept Postgres-compatible
// (TEXT ids, INTEGER millis, no SQLite-only column types) so the launch
// migration is a driver swap, not a remodel.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_currency TEXT NOT NULL DEFAULT 'INR',
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🧾',
  color TEXT NOT NULL DEFAULT '#6B7A70',
  sort INTEGER NOT NULL DEFAULT 0,
  budget_minor INTEGER
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  frequency TEXT NOT NULL,
  anchor_day INTEGER NOT NULL,
  next_due_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_hh_due ON recurring_expenses(household_id, active, next_due_on);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  fx_to_home REAL NOT NULL DEFAULT 1,
  category_id TEXT REFERENCES categories(id),
  merchant TEXT,
  note TEXT,
  spent_on TEXT NOT NULL,
  spent_time TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  raw_input TEXT,
  request_id TEXT,
  recurring_rule_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_hh_date ON expenses(household_id, spent_on);

CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '⚡',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  category_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'iPhone Shortcut',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
`;

declare global {
  var __twocents_db: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!global.__twocents_db) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const d = new Database(path.join(dir, "twocents.db"));
    d.pragma("journal_mode = WAL");
    d.exec(SCHEMA);
    migrate(d);
    global.__twocents_db = d;
  }
  return global.__twocents_db;
}

// Additive migrations for databases created before a column existed.
export function migrate(d: Database.Database) {
  const cols = d.prepare("PRAGMA table_info(expenses)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "spent_time")) {
    d.exec("ALTER TABLE expenses ADD COLUMN spent_time TEXT");
  }
  if (!cols.some((c) => c.name === "request_id")) {
    d.exec("ALTER TABLE expenses ADD COLUMN request_id TEXT");
  }
  if (!cols.some((c) => c.name === "recurring_rule_id")) {
    d.exec("ALTER TABLE expenses ADD COLUMN recurring_rule_id TEXT");
  }
  const categoryCols = d.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
  if (!categoryCols.some((column) => column.name === "budget_minor")) {
    d.exec("ALTER TABLE categories ADD COLUMN budget_minor INTEGER");
  }
  d.exec(`
    UPDATE categories
    SET sort = sort + 1
    WHERE name = 'Other'
      AND household_id IN (
        SELECT h.id
        FROM households h
        WHERE NOT EXISTS (
          SELECT 1 FROM categories c
          WHERE c.household_id = h.id AND c.name = 'Household Help'
        )
      );

    INSERT INTO categories (id, household_id, name, emoji, color, sort)
    SELECT 'household-help-' || h.id, h.id, 'Household Help', '🧹', '#6B7A70', 11
    FROM households h
    WHERE NOT EXISTS (
      SELECT 1 FROM categories c
      WHERE c.household_id = h.id AND c.name = 'Household Help'
    );
  `);
  d.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_request ON expenses(user_id, request_id)"
  );
  d.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id)"
  );
  d.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_due ON expenses(recurring_rule_id, spent_on)"
  );
}

export function uid(): string {
  return crypto.randomUUID();
}
