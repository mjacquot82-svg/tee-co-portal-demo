import local from '../customer-mock/playwright.config.js';

const profileTests = ['customer-hydration-schema-fallback.spec.js', 'customer-portal-profile-editing.spec.js'];
export default {
  ...local,
  testDir: '..',
  testMatch: [...profileTests, 'customer-mock/mobile-order.spec.js'],
  outputDir: '../../test-results/customer-mock-ci',
  use: { ...local.use, channel: undefined, browserName: 'chromium' },
  projects: [
    { name: 'customer-mock-desktop', testMatch: profileTests, use: { viewport: { width: 1280, height: 900 } } },
    { name: 'customer-mock-phone', testMatch: profileTests, use: { viewport: { width: 390, height: 844 } } },
    { name: 'full-app-mobile', testMatch: 'customer-mock/mobile-order.spec.js', use: { viewport: { width: 390, height: 844 } } },
  ],
};
