import { defineConfig, devices } from '@playwright/test';

/** Separate isolated fixture; never seeds or reads a development database. */
export default defineConfig({
  testDir: './large-menu', outputDir: '../../test-results/large-menu',
  forbidOnly: Boolean(process.env['CI']), workers: 1, retries: 0,
  timeout: 90_000, expect: { timeout: 15_000 },
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tools/e2e-backend.cjs --large', url: 'http://127.0.0.1:3000/api/health/ready', cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm nx build frontend && pnpm exec vite preview --config apps/frontend-e2e/vite.config.mts', url: 'http://127.0.0.1:4200', cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
