import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './apps/backend/src/db/schema.ts',
  out: './apps/backend/drizzle'
});
