import { test as base, expect } from '@playwright/test';

export { expect };
export const test = base.extend({
  isolatedCustomerRequests: [async ({ context, baseURL }, use, info) => {
    // Existing broad-suite behavior stays visible; this fixture is opt-in.
    if (!info.project.name.startsWith('customer-mock-')) { await use(); return; }
    expect(baseURL).toBe('http://127.0.0.1:4191');
    const unexpected = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort(); return;
      }
      // Test-specific page routes fulfill customer reads/writes ahead of this guard.
      // Empty unrelated read models are deterministic; no write is allowed through.
      if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET' && !url.pathname.startsWith('/rest/v1/customers')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return;
      }
      if (/^\/(rest|auth|storage|functions)\//.test(url.pathname) || url.pathname.startsWith('/.netlify/') || !['GET', 'HEAD'].includes(request.method())) {
        unexpected.push(`${request.method()} ${url.pathname}`);
        await route.abort(); return;
      }
      await route.continue();
    });
    await use();
    expect(unexpected, 'no unmocked service call or external request').toEqual([]);
  }, { auto: true }],
});
