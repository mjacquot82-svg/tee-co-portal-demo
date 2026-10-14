import config from './playwright.config.js';
export default { ...config, testDir: '.', testMatch: 'mobile-order.spec.js', projects: [{ name: 'full-app-mobile', use: { viewport: { width: 390, height: 844 } } }], outputDir: '../../test-results/full-app-mobile' };
