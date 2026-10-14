import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:4191';
const choice = 'I need Tee & Co to create my artwork';
const description = 'Wording and design wanted (required)';
const customer = { id: '11111111-1111-4111-8111-111111111111', auth_user_id: 'synthetic-auth', external_reference: 'synthetic-auth', name: 'Synthetic Customer', email: 'synthetic@example.invalid', phone: '+15195550123', company: 'Synthetic Team' };
const products = ['Synthetic Shirt', 'Synthetic Hoodie'].map((name, i) => ({ id: `22222222-2222-4222-8222-22222222222${i}`, name, status: 'Active', category: 'Apparel', storefront_category: 'Apparel', product_type: 'Apparel', colors: ['Black'], sizes: ['M', 'L'], base_garment_price: 20, unit_price: 20, decoration_types: ['DTF'], production_methods: ['DTF'], placements: ['Front'], is_featured: true }));
for (const mixed of [false, true]) test(`full app phone ${mixed ? 'mixed upload and design' : 'no-file design'} catalog to submission`, async ({ page, context }, info) => {
 test.skip(info.project.name !== 'full-app-mobile', 'Dedicated loopback configuration only.');
 const unexpected = [], submissions = [], uploads = [], artwork = [];
 const reads = { products, customers: [customer], orders: [], customer_artwork: artwork,
 categories: [], storefront_categories: [], brands: [], colors: [], sizes: [], garment_models: [], garment_library_items: [], garment_model_colors: [], payments: [], payment_requests: [], payment_events: [] };
 await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const reply = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.origin === origin) {
   const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
   if (method === 'GET' && Object.hasOwn(reads, table)) return reply(request.headers().accept?.includes('application/vnd.pgrst.object') ? reads[table][0] || null : reads[table]);
   if (method === 'PATCH' && table === 'customer_artwork') {
    expect(artwork).toHaveLength(1); expect(submissions).toHaveLength(1);
    expect(url.searchParams.get('id')).toBe(`eq.${artwork[0].id}`);
    const payload = request.postDataJSON();
    expect(payload.linked_quote_ids).toContain(submissions[0].order_number);
    Object.assign(artwork[0], payload); return reply(artwork[0]);
   }
   if (method === 'POST' && table === 'customers') {
    const payload = request.postDataJSON();
    expect(payload).toMatchObject({ id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, auth_user_id: customer.auth_user_id });
    expect(submissions).toHaveLength(1);
    return reply(payload);
   }
   if (method === 'POST' && table === 'notification_activity') {
    // Persist only synthetic activity metadata; provider/function delivery stays blocked.
    const payload = request.postDataJSON(); expect(submissions).toHaveLength(1);
    return reply(payload);
   }
   if (method === 'POST' && table === 'orders') {
    const payload = request.postDataJSON(); submissions.push(payload);
    const row = { ...payload, id: '33333333-3333-4333-8333-333333333333' }; reads.orders.push(row); return reply(row);
   }
   if (method === 'POST' && table === 'customer_artwork') {
    const payload = request.postDataJSON(); expect(payload.customer_id).toBe(customer.id);
    const row = { ...payload, id: '44444444-4444-4444-8444-444444444444' }; artwork.push(row); return reply(row);
   }
   if (method === 'POST' && url.pathname.startsWith(`/storage/v1/object/customer-artwork/${customer.id}/`)) {
    uploads.push(url.pathname); expect(request.postDataBuffer()?.length).toBeGreaterThan(0); return reply({ Key: url.pathname.split('/object/')[1] });
   }
   if (method === 'POST' && url.pathname.startsWith(`/storage/v1/object/sign/customer-artwork/${customer.id}/`)) return reply({ signedURL: '/storage/v1/object/sign/synthetic.svg?token=synthetic' });
   if (method === 'GET' && url.pathname === '/storage/v1/object/sign/synthetic.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
   if (['GET','HEAD'].includes(method) && !/^\/(rest|auth|storage|functions)\//.test(url.pathname) && !url.pathname.startsWith('/.netlify/')) return route.continue();
  }
  unexpected.push(`${method} ${url.origin}${url.pathname}`); await route.abort();
 });
 await page.addInitScript(({ customer }) => {
  if (!localStorage.getItem('teeCoCustomers')) localStorage.setItem('teeCoCustomers', JSON.stringify([customer]));
  if (!sessionStorage.getItem('teeCoActiveCustomerSession')) sessionStorage.setItem('teeCoActiveCustomerSession', JSON.stringify({ id: customer.auth_user_id, firstName: 'Synthetic', lastName: 'Customer', displayName: customer.name, email: customer.email, phone: customer.phone, authMode: 'supabase-session', isSupabaseAuthSession: true }));
 }, { customer });
 try {
  await page.goto('/portal/order');
  await page.getByRole('link').filter({ hasText: 'Synthetic Shirt' }).first().click();
  await page.getByRole('link', { name: 'Continue to Configure Garment' }).click();
  await page.getByLabel('M quantity').fill('2');
  await page.getByLabel(choice).check();
  await page.getByRole('button', { name: 'Save Garment', exact: true }).click();
  await expect(page.getByText('Describe the wording and design wanted for this garment.')).toBeVisible();
  expect(submissions).toHaveLength(0);
  await page.getByLabel(description).fill('Blue compass and TRAIL TEAM');
  await page.reload();
  await expect(page.getByLabel(description)).toHaveValue('Blue compass and TRAIL TEAM');
  await page.getByRole('button', { name: 'Save Garment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit Order Request' })).toBeVisible();
  if (mixed) {
   await page.getByRole('button', { name: 'Add Another Garment' }).click();
   await page.getByRole('link').filter({ hasText: 'Synthetic Hoodie' }).first().click();
   await page.getByRole('link', { name: 'Continue to Configure Garment' }).click();
   await page.getByLabel('M quantity').fill('1');
   await page.getByTestId('order-artwork-upload-input').setInputFiles({ name: 'synthetic.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="8"/></svg>') });
   await page.getByRole('button', { name: 'Save Garment', exact: true }).click();
   await expect(page.getByRole('button', { name: 'Submit Order Request' })).toBeVisible();
  }
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Save Garment', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Submit Order Request' })).toBeVisible();
  await page.reload();
  const resume = page.getByRole('button', { name: /Resume Draft/ });
  if (await resume.isVisible()) await resume.click();
  await expect(page.getByLabel(description)).toHaveValue('Blue compass and TRAIL TEAM');
  await expect(page.getByTestId('customer-order-line-item')).toHaveCount(mixed ? 2 : 1);
  await page.getByRole('button', { name: 'Submit Order Request' }).click();
  await expect.poll(() => submissions.length).toBe(1);
  await expect(page).toHaveURL(/order-submitted/);
  await expect(page.getByRole('heading', { name: 'Order submitted successfully' })).toBeVisible();
  expect(submissions[0]).toMatchObject({ customer_id: customer.id, artwork_approval_required: true, artwork_approval_status: 'Pending Review', production_ready: false, operational_visible: false });
  expect(submissions[0].line_items[0]).toMatchObject({ artwork_mode: 'create', artwork_description: 'Blue compass and TRAIL TEAM', artwork_id: '' });
  expect(uploads).toHaveLength(mixed ? 1 : 0);
  if (mixed) expect(submissions[0].line_items[1]).toMatchObject({ artwork_mode: 'upload', artwork_id: artwork[0].id });
  await page.screenshot({ path: info.outputPath(`submitted-${mixed ? 'mixed' : 'no-file'}.png`), fullPage: true });
  await writeFile(info.outputPath(`submitted-${mixed ? 'mixed' : 'no-file'}.json`), JSON.stringify(submissions[0], null, 2));
  expect(submissions[0].line_items[0].quantity, 'quantity entered before configuration reload is retained').toBe(2);
 } finally { expect.soft(unexpected, 'no unexpected service or external requests').toEqual([]); }
});
