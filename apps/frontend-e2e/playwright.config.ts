import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env['E2E_FRONTEND_PORT'] ?? '4200';
const backendPort = process.env['E2E_BACKEND_PORT'] ?? '3000';

export default defineConfig({
  testDir: './src',
  outputDir: '../../test-results/frontend-e2e',
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  // All scenarios own a fresh browser context but share this suite-owned DB.
  // Serialize mutations so one scenario cannot invalidate another's quote.
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${frontendPort}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tools/e2e-backend.cjs', url: `http://127.0.0.1:${backendPort}/api/health/ready`, cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
    { command: `pnpm nx build frontend && pnpm exec vite preview --config apps/frontend-e2e/vite.config.mts --port ${frontendPort}`, url: `http://127.0.0.1:${frontendPort}`, cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
