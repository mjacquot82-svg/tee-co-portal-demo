import { defineConfig, devices } from '@playwright/test';
// Do not import the default config: it loads .env.playwright.
export default defineConfig({
  testDir: '..', fullyParallel: false, forbidOnly: true, workers: 1, retries: 0,
  reporter: 'line', timeout: 30000,
  outputDir: '../../test-results/offline-ci',
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { cwd: '../..', command: 'node node_modules/vite/bin/vite.js --config tests/ci/vite.config.js', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 },
});
