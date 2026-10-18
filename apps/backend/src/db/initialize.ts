import { openDatabase } from './connection';
import { migrateDatabase } from './migrate';
import { seedDatabase, type SeedMode } from './seed';

export function initializeDatabase(options: { filename: string; migrationsFolder?: string; seedMode?: SeedMode }) {
  const connection = openDatabase(options.filename);
  try {
    migrateDatabase(connection, options.migrationsFolder);
    seedDatabase(connection, options.seedMode ?? 'none');
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}
