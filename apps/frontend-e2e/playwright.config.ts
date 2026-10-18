import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  outputDir: '../../test-results/frontend-e2e',
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  // All scenarios own a fresh browser context but share this suite-owned DB.
  // Serialize mutations so one scenario cannot invalidate another's quote.
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tools/e2e-backend.cjs', url: 'http://127.0.0.1:3000/api/health/ready', cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm nx build frontend && pnpm exec vite preview --config apps/frontend-e2e/vite.config.mts', url: 'http://127.0.0.1:4200', cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
