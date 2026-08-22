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
  sort INTEGER NOT NULL DEFAULT 0
);

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
`;

declare global {
  // eslint-disable-next-line no-var
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
function migrate(d: Database.Database) {
  const cols = d.prepare("PRAGMA table_info(expenses)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "spent_time")) {
    d.exec("ALTER TABLE expenses ADD COLUMN spent_time TEXT");
  }
  if (!cols.some((c) => c.name === "request_id")) {
    d.exec("ALTER TABLE expenses ADD COLUMN request_id TEXT");
  }
  d.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_request ON expenses(user_id, request_id)"
  );
}

export function uid(): string {
  return crypto.randomUUID();
}
