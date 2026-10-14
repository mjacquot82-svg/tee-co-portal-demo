import { expect, test } from '@playwright/test';
const choice = 'I need Tee & Co to create my artwork';
const description = 'Wording and design wanted (required)';

test.beforeEach(async ({ page, context }, info) => {
 test.skip(info.project.name !== 'isolated-artwork', 'Requires the isolated artwork config; never run against a deployed app.');
 const external = [];
 page.on('pageerror', error => console.error('BROWSER PAGE ERROR:', error.message));
 await context.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin !== 'http://127.0.0.1:4187' || url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
     external.push(url.origin + url.pathname); await route.abort(); return;
   }
   await route.continue();
 });
 await page.goto('/');
 await expect(page.getByRole('heading', { name: 'Synthetic artwork browser fixture' })).toBeVisible();
 page.__external = external;
});
test.afterEach(async ({ page }) => { if (page.__external) expect(page.__external, 'no external/backend/provider request attempted').toEqual([]); });
async function resumeIfNeeded(page) { const resume = page.getByRole('button', { name: /Resume Draft/ }); if (await resume.isVisible()) await resume.click(); }

test('two no-file requests: description validation, real reload, submission and staff gating', async ({ page }, info) => {
 await page.getByRole('button', { name: 'Start two garments' }).click();
 const options = page.getByLabel(choice);
 await expect(options).toHaveCount(2);
 await options.nth(0).check(); await options.nth(1).check();
 await page.getByLabel(description).nth(0).fill('   ');
 await page.getByRole('button', { name: 'Submit Order Request' }).click();
 await expect(page.getByText(/Describe the wording and design wanted for each garment/)).toBeVisible();
 expect(await page.evaluate(() => window.__artworkTest.submissions.length)).toBe(0);
 await page.getByLabel(description).nth(0).fill('Blue mountain with TRAIL CLUB');
 await page.getByLabel(description).nth(1).fill('White TEAM lettering on back');
 await page.reload(); await resumeIfNeeded(page);
 await expect(page.getByLabel(description).nth(0)).toHaveValue('Blue mountain with TRAIL CLUB');
 await expect(page.getByLabel(description).nth(1)).toHaveValue('White TEAM lettering on back');
 await page.screenshot({ path: info.outputPath('design-review-desktop.png'), fullPage: true });
 await page.getByRole('button', { name: 'Submit Order Request' }).click();
 await expect(page.getByRole('heading', { name: 'Synthetic submission received' })).toBeVisible();
 await expect(page.getByText('Artwork approval: Pending Review')).toBeVisible();
 await expect(page.getByText('Production enabled: false')).toBeVisible();
 await expect(page.getByTestId('garment-production-file')).toHaveText(['Missing', 'Missing']);
 await expect(page.getByText('Tee & Co to create artwork: Blue mountain with TRAIL CLUB')).toBeVisible();
 const state = await page.evaluate(() => window.__artworkTest);
 expect(state.uploads).toEqual([]); expect(state.submissions).toHaveLength(1);
 expect(state.submissions[0].artwork_files).toEqual([]);
 expect(state.submissions[0]).toMatchObject({ production_ready: false, artwork_approval_required: true, artwork_approval_status: 'Pending Review' });
 await page.screenshot({ path: info.outputPath('staff-pending-desktop.png'), fullPage: true });
});

test('mixed order: upload, switch to design and back, browser Back/Forward, then submit', async ({ page }, info) => {
 await page.getByRole('button', { name: 'Start two garments' }).click();
 await page.getByLabel(choice).nth(0).check();
 await page.getByLabel(description).fill('Create a red compass');
 await page.getByRole('button', { name: 'Edit Garment' }).nth(1).click();
 await page.getByLabel(choice).check();
 await page.getByLabel(description).fill('Temporary alternate design');
 await page.reload();
 await expect(page.getByLabel(choice)).toBeChecked();
 await expect(page.getByLabel(description)).toHaveValue('Temporary alternate design');
 await page.getByLabel(choice).uncheck();
 await page.getByTestId('order-artwork-upload-input').setInputFiles({ name: 'Synthetic.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="blue"/></svg>') });
 await page.getByRole('button', { name: 'Save Garment Changes' }).click();
 await expect(page.getByRole('button', { name: 'Submit Order Request' })).toBeVisible();
 await page.goBack();
 await expect(page.getByLabel(choice)).not.toBeChecked();
 await page.goForward();
 await expect(page.getByLabel(description)).toHaveValue('Create a red compass');
 await page.reload(); await resumeIfNeeded(page);
 await expect(page.getByTestId('customer-order-line-item')).toHaveCount(2);
 await page.screenshot({ path: info.outputPath('mixed-review-desktop.png'), fullPage: true });
 await page.getByRole('button', { name: 'Submit Order Request' }).click();
 await expect(page.getByRole('heading', { name: 'Synthetic submission received' })).toBeVisible();
 const state = await page.evaluate(() => window.__artworkTest);
 expect(state.uploads).toEqual(['Synthetic.svg']);
 expect(state.submissions[0].line_items.map(item => item.artwork_mode)).toEqual(['create', 'upload']);
 expect(state.submissions[0].line_items[1].artwork_id).toBe('synthetic-logo');
 expect(state.submissions[0].artwork_files).toHaveLength(1);
 await expect(page.getByText('Artwork approval: Pending Review')).toBeVisible();
 await expect(page.getByText('Production enabled: false')).toBeVisible();
});

test('phone configuration: required description, browser Back/Forward and reload before save', async ({ page }, info) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: 'Configure garment' }).click();
 await page.getByLabel(choice).check();
 await page.getByRole('button', { name: 'Save Garment', exact: true }).click();
 await expect(page.getByText('Describe the wording and design wanted for this garment.')).toBeVisible();
 await page.getByLabel(description).fill('Gold star with SUMMER CREW');
 await page.getByRole('button', { name: 'Back', exact: true }).last().click();
 await expect(page.getByRole('heading', { name: 'Synthetic artwork browser fixture' })).toBeVisible();
 await page.goForward();
 await expect(page.getByLabel(description)).toHaveValue('Gold star with SUMMER CREW');
 await page.reload();
 await expect(page.getByLabel(description)).toHaveValue('Gold star with SUMMER CREW');
 await page.screenshot({ path: info.outputPath('design-config-phone.png'), fullPage: true });
 await page.getByRole('button', { name: 'Save Garment', exact: true }).click();
 await expect(page.getByLabel(description)).toHaveValue('Gold star with SUMMER CREW');
 await page.getByRole('button', { name: 'Submit Order Request' }).click();
 await expect(page.getByRole('heading', { name: 'Synthetic submission received' })).toBeVisible();
 await expect(page.getByText('Production enabled: false')).toBeVisible();
});


