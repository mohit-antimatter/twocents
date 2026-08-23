import { PGlite, types } from "@electric-sql/pglite";

import {
  closeDatabase,
  initializeDatabase,
  setDatabaseForTests,
  type AppDatabase,
  type Queryable,
  type QueryResult,
} from "../lib/db";

class PGliteDatabase implements AppDatabase {
  constructor(private readonly client: PGlite) {}

  async query<T>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(text, values ? [...values] : undefined);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.affectedRows ?? 0,
    };
  }

  async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    return this.client.transaction(async (transaction) =>
      work({
        query: async <R>(text: string, values?: readonly unknown[]) => {
          const result = await transaction.query<R>(text, values ? [...values] : undefined);
          return {
            rows: result.rows,
            rowCount: result.rowCount ?? result.affectedRows ?? 0,
          };
        },
      })
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export async function createTestDatabase(): Promise<AppDatabase> {
  const client = await PGlite.create({
    dataDir: "memory://",
    parsers: {
      [types.INT8]: Number,
    },
  });
  const database = new PGliteDatabase(client);
  await initializeDatabase(database);
  return database;
}

export async function installTestDatabase(): Promise<AppDatabase> {
  await closeDatabase();
  const database = await createTestDatabase();
  setDatabaseForTests(database);
  return database;
}
