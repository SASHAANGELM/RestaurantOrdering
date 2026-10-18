import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export const DEFAULT_DATABASE_PATH = 'data/restaurant.sqlite';
export const BUSY_TIMEOUT_MS = 5_000;

export function openDatabase(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new BetterSqlite3(filename, { timeout: BUSY_TIMEOUT_MS });
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    return { sqlite, db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export type DatabaseConnection = ReturnType<typeof openDatabase>;
