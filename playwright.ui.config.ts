import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'shop.spec.ts',
    'view-mode.spec.ts',
  ],
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    ...devices['Desktop Chrome'],
    channel: 'msedge',
  },
});
