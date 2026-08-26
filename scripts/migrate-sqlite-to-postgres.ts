import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";

import {
  closeDatabase,
  db,
  ensureHouseholdHelpCategories,
  type AppDatabase,
  type Queryable,
} from "../lib/db";

const TABLES = [
  { name: "users", columns: ["id", "email", "name", "password_hash", "created_at"] },
  {
    name: "auth_identities",
    columns: ["provider", "provider_user_id", "user_id", "created_at"],
  },
  {
    name: "households",
    columns: ["id", "name", "home_currency", "invite_code", "created_at"],
  },
  {
    name: "household_members",
    columns: ["household_id", "user_id", "role", "joined_at"],
  },
  {
    name: "categories",
    columns: ["id", "household_id", "name", "emoji", "color", "sort", "budget_minor"],
  },
  {
    name: "recurring_expenses",
    columns: [
      "id",
      "household_id",
      "user_id",
      "label",
      "amount_minor",
      "currency",
      "category_id",
      "frequency",
      "anchor_day",
      "next_due_on",
      "active",
      "created_at",
    ],
  },
  {
    name: "expenses",
    columns: [
      "id",
      "household_id",
      "user_id",
      "amount_minor",
      "currency",
      "fx_to_home",
      "category_id",
      "merchant",
      "note",
      "spent_on",
      "spent_time",
      "source",
      "raw_input",
      "request_id",
      "recurring_rule_id",
      "created_at",
    ],
  },
  {
    name: "presets",
    columns: [
      "id",
      "household_id",
      "label",
      "emoji",
      "amount_minor",
      "currency",
      "category_id",
      "sort",
    ],
  },
  {
    name: "api_tokens",
    columns: ["id", "user_id", "token_hash", "label", "created_at", "last_used_at"],
  },
  { name: "rate_limits", columns: ["key_hash", "attempts", "reset_at"] },
  { name: "sessions", columns: ["id", "user_id", "expires_at"] },
] as const;

type MigrationCounts = Record<string, number>;

function sqliteTables(source: Database.Database): Set<string> {
  const rows = source
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function sqliteColumns(source: Database.Database, table: string): Set<string> {
  const rows = source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

async function assertTargetIsEmpty(target: Queryable): Promise<void> {
  const populated: string[] = [];
  for (const table of TABLES) {
    const result = await target.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table.name}`
    );
    if (result.rows[0].count > 0) populated.push(table.name);
  }
  if (populated.length > 0) {
    throw new Error(
      `PostgreSQL import stopped because the target already contains data in: ${populated.join(
        ", "
      )}. Use a fresh database to avoid duplicates or overwrites.`
    );
  }
}

export async function importLegacySqlite(
  source: Database.Database,
  target: AppDatabase
): Promise<MigrationCounts> {
  const availableTables = sqliteTables(source);
  await assertTargetIsEmpty(target);

  return target.transaction(async (client) => {
    const counts: MigrationCounts = {};
    for (const table of TABLES) {
      if (!availableTables.has(table.name)) {
        counts[table.name] = 0;
        continue;
      }

      const availableColumns = sqliteColumns(source, table.name);
      const columns = table.columns.filter((column) => availableColumns.has(column));
      const rows = source
        .prepare(`SELECT ${columns.join(", ")} FROM ${table.name}`)
        .all() as Record<string, unknown>[];
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

      for (const row of rows) {
        await client.query(
          `INSERT INTO ${table.name} (${columns.join(", ")}) VALUES (${placeholders})`,
          columns.map((column) => row[column])
        );
      }
      counts[table.name] = rows.length;
    }

    await ensureHouseholdHelpCategories(client);
    return counts;
  });
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const sourcePath = path.resolve(process.argv[2] ?? "data/twocents.db");
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite source not found: ${sourcePath}`);
  }
  if (!process.env.DATABASE_URL && !process.env.DIRECT_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL or DIRECT_DATABASE_URL is missing. Add one to .env.local before importing."
    );
  }
  if (process.env.DIRECT_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
  }

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const counts = await importLegacySqlite(source, db());
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    console.log(`Imported ${total} rows from SQLite into PostgreSQL.`);
    for (const [table, count] of Object.entries(counts)) {
      console.log(`${table}: ${count}`);
    }
  } finally {
    source.close();
    await closeDatabase();
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
