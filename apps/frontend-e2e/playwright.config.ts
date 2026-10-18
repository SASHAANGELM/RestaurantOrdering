import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  outputDir: '../../test-results/frontend-e2e',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm nx run backend:serve', url: 'http://127.0.0.1:3000/api', cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm nx run frontend:serve', url: 'http://127.0.0.1:4200', cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
