import express from 'express';
import { resolve } from 'node:path';
import { DEFAULT_DATABASE_PATH } from './db/connection';
import { initializeDatabase } from './db/initialize';
import { parseSeedMode } from './db/seed';

const connection = initializeDatabase({
  filename: process.env['DATABASE_PATH'] ?? DEFAULT_DATABASE_PATH,
  migrationsFolder: resolve(__dirname, 'drizzle'),
  seedMode: parseSeedMode(process.env['SEED_MODE'] ?? 'small')
});
process.once('exit', () => connection.close());

const app = express();

app.disable('x-powered-by');
app.get('/api', (_request, response) => {
  response.json({ name: 'Restaurant Ordering API' });
});

app.listen(3000, '127.0.0.1', () => {
  console.info('Restaurant Ordering API listening on http://127.0.0.1:3000/api');
});
