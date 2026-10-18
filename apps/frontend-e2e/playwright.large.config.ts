import { defineConfig, devices } from '@playwright/test';

/** Separate isolated fixture; never seeds or reads a development database. */
export default defineConfig({
  testDir: './large-menu', outputDir: '../../test-results/large-menu',
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm nx run backend:serve', url: 'http://127.0.0.1:3000/api', cwd: '../..', env: { DATABASE_PATH: ':memory:', SEED_MODE: 'large' }, reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm nx run frontend:serve', url: 'http://127.0.0.1:4200', cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
