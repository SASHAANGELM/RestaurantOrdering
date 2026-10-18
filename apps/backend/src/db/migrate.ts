import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseConnection } from './connection';
import { appState } from './schema';
import { upgradeLegacyDemo } from './upgrade-demo';

export function migrateDatabase(connection: DatabaseConnection, migrationsFolder = resolve(__dirname, '../../drizzle')) {
  // Drizzle applies pending SQL and its migration journal in one synchronous transaction.
  migrate(connection.db, { migrationsFolder });
  connection.db.insert(appState).values({ id: 1 }).onConflictDoNothing().run();
  upgradeLegacyDemo(connection);
}
