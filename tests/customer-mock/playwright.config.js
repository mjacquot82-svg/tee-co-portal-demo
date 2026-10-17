import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  testMatch: ['customer-hydration-schema-fallback.spec.js', 'customer-portal-profile-editing.spec.js'],
  fullyParallel: false, workers: 1, retries: 0, timeout: 30000, reporter: 'line',
  outputDir: '../../test-results/customer-mock',
  projects: [
    { name: 'customer-mock-desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'customer-mock-phone', use: { viewport: { width: 390, height: 844 } } },
  ],
  use: { baseURL: 'http://127.0.0.1:4191', channel: 'msedge', headless: true, serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { cwd: '../..', command: 'node node_modules/vite/bin/vite.js --config tests/customer-mock/vite.config.js', url: 'http://127.0.0.1:4191', reuseExistingServer: false, timeout: 30000 },
});
