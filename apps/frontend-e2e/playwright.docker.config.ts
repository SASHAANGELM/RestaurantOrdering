import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './deployment',
  outputDir: '../../test-results/docker',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { baseURL: process.env['DOCKER_SMOKE_URL'] ?? 'http://127.0.0.1:0', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
