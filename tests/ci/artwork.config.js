import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../artwork-browser', testMatch: 'acceptance.spec.js',
  fullyParallel: false, forbidOnly: true, workers: 1, retries: 0, timeout: 30000,
  projects: [{ name: 'isolated-artwork' }], reporter: 'line',
  outputDir: '../../test-results/artwork-browser-ci',
  use: { baseURL: 'http://127.0.0.1:4187', browserName: 'chromium', headless: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config tests/artwork-browser/vite.config.js', url: 'http://127.0.0.1:4187', reuseExistingServer: false, timeout: 30000 },
});
