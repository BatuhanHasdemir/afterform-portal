import { defineConfig } from '@playwright/test';

const PORT = 3200;

export default defineConfig({
  testDir: 'tests/e2e',
  // One mock server with one data set that every test resets: the tests must not overlap.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The installed Chrome, so no separate browser download is needed.
    channel: 'chrome',
    locale: 'tr-TR',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
