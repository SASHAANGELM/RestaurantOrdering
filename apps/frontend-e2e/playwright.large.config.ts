import { defineConfig, devices } from '@playwright/test';

/** Separate isolated fixture; never seeds or reads a development database. */
const frontendPort = process.env['E2E_FRONTEND_PORT'] ?? '4200';
const backendPort = process.env['E2E_BACKEND_PORT'] ?? '3000';

export default defineConfig({
  testDir: './large-menu', outputDir: '../../test-results/large-menu',
  forbidOnly: Boolean(process.env['CI']), workers: 1, retries: 0,
  timeout: 90_000, expect: { timeout: 15_000 },
  reporter: 'list', use: { baseURL: `http://127.0.0.1:${frontendPort}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tools/e2e-backend.cjs --large', url: `http://127.0.0.1:${backendPort}/api/health/ready`, cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
    { command: `pnpm nx build frontend && pnpm exec vite preview --config apps/frontend-e2e/vite.config.mts --port ${frontendPort}`, url: `http://127.0.0.1:${frontendPort}`, cwd: '../..', reuseExistingServer: false, timeout: 120_000 }
  ]
});
