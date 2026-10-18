import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  test: {
    name: 'contracts',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true
  }
});
