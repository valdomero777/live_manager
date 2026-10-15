import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_FILE, E2E_BASE_URL } from './settings.js';

const ci = !!process.env['CI'];

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // One server and one database for the whole run: tests share state, so they run in order.
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx e2e/start-server.ts',
    cwd: '..',
    url: `${E2E_BASE_URL}/api/v1/health`,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: E2E_AUTH_FILE },
      dependencies: ['setup'],
    },
  ],
});
