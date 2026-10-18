import { resolve } from 'node:path';
import { DEFAULT_DATABASE_PATH, openDatabase } from './db/connection';
import { migrateDatabase } from './db/migrate';
import { seedDatabase } from './db/seed';

const command = process.argv[2];
if (command !== 'migrate' && command !== 'seed-small' && command !== 'seed-large') {
  throw new Error('Usage: database-cli.cjs migrate|seed-small|seed-large');
}
const connection = openDatabase(process.env['DATABASE_PATH'] ?? DEFAULT_DATABASE_PATH);
try {
  migrateDatabase(connection, resolve(__dirname, 'drizzle'));
  if (command === 'migrate') console.info('Database migrations applied.');
  else console.info(seedDatabase(connection, command === 'seed-small' ? 'small' : 'large'));
} finally {
  connection.close();
}
