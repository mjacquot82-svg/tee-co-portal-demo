import React from 'react';
import { webcrypto as nodeWebcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Outlet, useLocation, useNavigate } from 'react-router-dom';
import RequestOrder from './CustomerPortalRequestOrder';
import OrderPreview from '../pages/OrderPreview';
import GarmentProductionCards from '../order-detail/GarmentProductionCards';
vi.mock('../lib/customerSessionStore', () => ({ getActiveCustomerSession: () => ({ email: 'synthetic@example.test' }) }));
import { savePendingCustomerRequest, getPendingCustomerRequest } from '../lib/pendingCustomerRequestStore';
import { buildSupabaseOrderPayload, mapSupabaseOrderRowToOrder, createOrderInSupabase, configureOrdersRepositoryForTests } from '../lib/ordersRepository';
import { getOrderLineItems } from '../lib/orderLineItems';
import { isArtworkApprovalSatisfied } from '../orders/workflowGating';
import { buildProductionReadiness } from '../quotes/productionReadiness';
import { requiresCustomerOrderArtwork } from './orderArtworkRequirement';
const mocks = vi.hoisted(() => ({ save: vi.fn(async (order) => ({ ...order, order_number: 'SYNTHETIC-1' })), saveWithStatus: vi.fn(), upload: vi.fn(async () => ({ id: 'persisted-logo', file_name: 'Logo.svg', storage_path: 'synthetic/logo.svg' })), assets: [], products: [{ id: 'shirt', name: 'Test Shirt', status: 'Active', colors: ['Black'], sizes: ['M'], placements: ['Front'], decoration_type: 'DTF', base_garment_price: 10 }] }));
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false, supabaseConfig: {}, supabaseDiagnostics: {} }));
// The screen now saves through createStoredOrderWithArtworkLinkStatus; it delegates to mocks.save so the
// existing payload assertions on mocks.save still apply to the exact payload the screen sends.
vi.mock('../lib/ordersStore', () => ({ createStoredOrder: mocks.save, createStoredOrderWithArtworkLinkStatus: mocks.saveWithStatus }));
vi.mock('../lib/customerProfileStore', () => ({ ensureCustomerProfile: async () => ({ id: 'synthetic-customer' }) }));
vi.mock('../lib/customersStore', () => ({ linkOrderToCustomer: vi.fn() }));
vi.mock('../services/customerArtworkService', () => ({ uploadCustomerArtwork: mocks.upload, listCustomerArtwork: async () => [], buildCustomerArtworkStoragePath: (customerId, fileName) => `${customerId}/synthetic-${fileName}`, findCustomerArtworkByStoragePath: async () => ({ status: 'absent' }) }));
vi.mock('./useCustomerPortalData', () => ({ useCustomerPortalData: () => ({ profile: {} }) }));
vi.mock('../lib/catalogLookupsStore', () => ({ useCatalogLookups: () => ({}) }));
vi.mock('../lib/pendingCustomerArtworkStore', () => ({ getPendingCustomerArtworkAssets: async () => mocks.assets, clearPendingCustomerArtwork: async () => true, savePendingCustomerArtworkAsset: async () => true }));
vi.mock('../lib/productsStore', async (original) => ({ ...(await original()), useStoredProducts: () => mocks.products, areStoredProductsReady: () => true }));
const line = (id, extra = {}) => ({ id, productId: 'shirt', garmentName: 'Test Shirt', decorationType: 'DTF', size_breakdown: { M: 2 }, placement: 'Front', ...extra });
const session = { id: 'synthetic-customer', email: 'synthetic@example.test', displayName: 'Synthetic Customer', phone: '5195551234' };
function mount() { return render(<MemoryRouter initialEntries={[{ pathname: '/request', state: { pendingRequestSource: 'public-garment-flow' } }]}><Routes><Route element={<Outlet context={{ customerSession: session }} />}><Route path="/request" element={<RequestOrder />} /></Route><Route path="*" element={<p>Submitted</p>} /></Routes></MemoryRouter>); }
function seed(items, artworkLibrary = []) { savePendingCustomerRequest({ productId: 'shirt', lineItems: items, artworkLibrary }); }
// Exclusive in-memory Web Locks stub (jsdom has no navigator.locks).
function installLocks() {
 const held = new Set();
 Object.defineProperty(navigator, 'locks', { configurable: true, value: { async request(name, options, callback) {
  if (held.has(name)) return callback(null);
  held.add(name);
  try { return await callback({ name, mode: options.mode }); } finally { held.delete(name); }
 } } });
}
// Content fingerprinting needs File.arrayBuffer and crypto.subtle.
if (typeof File.prototype.arrayBuffer !== 'function') {
 File.prototype.arrayBuffer = function arrayBuffer() { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(this); }); };
}
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nodeWebcrypto });
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); mocks.save.mockClear(); mocks.upload.mockClear(); mocks.saveWithStatus.mockReset(); mocks.saveWithStatus.mockImplementation(async (order) => ({ order: await mocks.save(order), artworkLink: { status: 'linked' }, followUpWarnings: [] })); mocks.assets = []; installLocks(); });
afterEach(cleanup);
test('two design-only garments survive reload and submit with pending approval and no upload', async () => {
 seed([line('a'), line('b')]);
 const first = mount();
 await screen.findAllByText(/Line Item 1/);
 for (const checkbox of screen.getAllByLabelText('I need Tee & Co to create my artwork')) fireEvent.click(checkbox);
 const descriptions = screen.getAllByLabelText('Wording and design wanted (required)');
 fireEvent.change(descriptions[0], { target: { value: 'Blue mountain with TRAIL CLUB' } });
 fireEvent.change(descriptions[1], { target: { value: 'White TEAM on back' } });
 await waitFor(() => expect(getPendingCustomerRequest().lineItems[1].artworkDescription).toBe('White TEAM on back'));
 first.unmount(); mount();
 expect(await screen.findByDisplayValue('Blue mountain with TRAIL CLUB')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Submit Order Request' }));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order).toMatchObject({ artwork_status: 'Design Requested', artwork_approval_required: true, artwork_approval_status: 'Pending Review', production_ready: false, operational_visible: false });
 expect(order.artwork_files).toEqual([]); expect(mocks.upload).not.toHaveBeenCalled();
 const restored = mapSupabaseOrderRowToOrder(buildSupabaseOrderPayload({ ...order, order_number: 'SYNTHETIC-1' }));
 expect(getOrderLineItems(restored).map(i => i.artwork_description)).toEqual(['Blue mountain with TRAIL CLUB', 'White TEAM on back']);
 expect(isArtworkApprovalSatisfied(restored)).toBe(false);
 expect(buildProductionReadiness(restored, {}).ready).toBe(false);
 expect(order.customer_notes).toContain('Tee & Co to create artwork: Blue mountain');
});
test('mixed uploaded and requested artwork retains only the selected uploaded asset', async () => {
 seed([line('a', { artworkMode: 'create', artworkDescription: 'Create a sunset' }), line('b', { artworkId: 'logo', artworkName: 'Logo.svg' })], [{ id: 'logo', displayName: 'Logo.svg', storageReference: 'synthetic/logo.svg' }, { id: 'unused', displayName: 'Unused.svg' }]);
 mount(); await screen.findByDisplayValue('Create a sunset');
 fireEvent.click(screen.getByRole('button', { name: 'Submit Order Request' }));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order.artwork_files.map(a => a.id)).toEqual(['logo']);
 expect(order.line_items[1].artwork_id).toBe('logo');
 expect(order.line_items[0].artwork_id).toBe('');
});
test('blank description blocks submission, switching back does not count description as artwork', async () => {
 seed([line('a')]); mount(); await screen.findAllByText(/Line Item 1/);
 fireEvent.click(screen.getByLabelText('I need Tee & Co to create my artwork'));
 fireEvent.change(screen.getByLabelText('Wording and design wanted (required)'), { target: { value: '  ' } });
 fireEvent.click(screen.getByRole('button', { name: 'Submit Order Request' }));
 await screen.findByText(/Describe the wording and design wanted for each garment/);
 expect(mocks.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByLabelText('I need Tee & Co to create my artwork'));
 fireEvent.click(screen.getByRole('button', { name: 'Submit Order Request' }));
 await screen.findByText('Artwork Required'); expect(mocks.save).not.toHaveBeenCalled();
});
test('one design request cannot cover a second undecided garment; blank request cannot hide behind uploaded artwork', async () => {
 const create = { decoration_type: 'DTF', artwork_mode: 'create', artwork_description: 'Mountain' };
 expect(requiresCustomerOrderArtwork([create, { decoration_type: 'DTF' }], [])).toBe(true);
 expect(requiresCustomerOrderArtwork([{ ...create, artwork_description: ' ' }], [{ id: 'logo' }])).toBe(true);
 expect(requiresCustomerOrderArtwork([create], [])).toBe(false);
 await expect(createOrderInSupabase({ source: 'Customer Portal', line_items: [{ ...create, artwork_description: ' ' }] })).rejects.toThrow('Describe the wording');
});

function PreviewHarness() {
 const location = useLocation(); const navigate = useNavigate();
 return <><button onClick={() => navigate(-1)}>History Back</button><button onClick={() => navigate(1)}>History Next</button><output data-testid="history-state">{JSON.stringify(location.state)}</output><Routes><Route path="/shop/order-preview" element={<OrderPreview />} /><Route path="*" element={<p>Next page</p>} /></Routes></>;
}
test('preview keeps design choice through Back/Next and reload and replaces the same garment', async () => {
 const entry = { pathname: '/shop/order-preview', state: { productId: 'shirt', garmentName: 'Test Shirt', selectedSize: 'M', quantity: 2 } };
 let view = render(<MemoryRouter initialEntries={[entry]}><PreviewHarness /></MemoryRouter>);
 fireEvent.click(screen.getByLabelText('I need Tee & Co to create my artwork'));
 fireEvent.change(screen.getByLabelText('Wording and design wanted (required)'), { target: { value: 'Make a blue star' } });
 const restoredState = JSON.parse(screen.getByTestId('history-state').textContent);
 view.unmount();
 view = render(<MemoryRouter initialEntries={[{ ...entry, state: restoredState }]}><PreviewHarness /></MemoryRouter>);
 expect(screen.getByDisplayValue('Make a blue star')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Save Garment', exact: true }));
 await screen.findByText('Next page');
 expect(getPendingCustomerRequest().lineItems[0].artworkDescription).toBe('Make a blue star');
 fireEvent.click(screen.getByRole('button', { name: 'History Back' }));
 expect(await screen.findByDisplayValue('Make a blue star')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'History Next' }));
 await screen.findByText('Next page');
 fireEvent.click(screen.getByRole('button', { name: 'History Back' }));
 fireEvent.change(await screen.findByLabelText('Wording and design wanted (required)'), { target: { value: 'Make a gold star' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save Garment', exact: true }));
 await screen.findByText('Next page');
 expect(getPendingCustomerRequest().lineItems).toHaveLength(1);
 expect(getPendingCustomerRequest().lineItems[0].artworkDescription).toBe('Make a gold star');
});
test('repository insert round trip preserves per-item request JSON without artwork files', async () => {
 let stored;
 const client = { from: () => ({ insert: payload => { stored = payload; return { select: () => ({ single: async () => ({ data: payload, error: null }) }) }; } }) };
 configureOrdersRepositoryForTests({ supabaseClient: client, supabaseConfigured: true, persistenceMode: 'strict' });
 try {
  const result = await createOrderInSupabase({ source: 'Customer Portal', order_number: 'SYNTHETIC-DB', line_items: [{ id: 'a', artwork_mode: 'create', artwork_description: 'Blue star' }], artwork_files: [], artwork_approval_required: true, artwork_approval_status: 'Pending Review' });
  expect(stored.line_items[0].artwork_description).toBe('Blue star');
  expect(result.line_items[0].artwork_mode).toBe('create');
  expect(result.artwork_approval_status).toBe('Pending Review');
 } finally { configureOrdersRepositoryForTests(); }
});

test('existing upload-only submission still uploads and attaches the resulting artwork', async () => {
 mocks.assets = [{ id: 'draft-logo', file: new File(['synthetic'], 'Logo.svg', { type: 'image/svg+xml' }) }];
 seed([line('a', { artworkId: 'draft-logo', artworkName: 'Logo.svg' })], [{ id: 'draft-logo', displayName: 'Logo.svg', originalFilename: 'Logo.svg' }]);
 mount(); await screen.findAllByText(/Line Item 1/);
 fireEvent.click(screen.getByRole('button', { name: 'Submit Order Request' }));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 expect(mocks.upload).toHaveBeenCalledOnce();
 expect(mocks.save.mock.calls[0][0].line_items[0].artwork_id).toBe('persisted-logo');
 expect(mocks.save.mock.calls[0][0].artwork_status).toBe('Pending Review');
 expect(mocks.saveWithStatus).toHaveBeenCalledOnce();
 expect(mocks.saveWithStatus.mock.calls[0][0].order_metadata.client_submission_key).toBeTruthy();
});
test('staff garment panel unmistakably shows the request and never labels missing artwork Ready', () => {
 render(<GarmentProductionCards order={{ line_items: [{ id: 'a', garment: 'Test Shirt', quantity: 2, artwork_mode: 'create', artwork_description: 'Blue star' }] }} />);
 expect(screen.getByText('Tee & Co to create artwork: Blue star')).toBeTruthy();
 expect(screen.getByTestId('garment-production-file').textContent).toBe('Missing');
});
test('preview requires description and switching from design to existing artwork clears active design mode', async () => {
 seed([], [{ id: 'logo', displayName: 'Logo.svg', storageReference: 'synthetic/logo.svg' }]);
 render(<MemoryRouter initialEntries={[{ pathname: '/shop/order-preview', state: { productId: 'shirt', selectedSize: 'M', quantity: 2 } }]}><PreviewHarness /></MemoryRouter>);
 fireEvent.click(screen.getByLabelText('I need Tee & Co to create my artwork'));
 fireEvent.click(screen.getByRole('button', { name: 'Save Garment', exact: true }));
 expect(await screen.findByText('Describe the wording and design wanted for this garment.')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Wording and design wanted (required)'), { target: { value: 'Blue star' } });
 fireEvent.click(screen.getByLabelText('Choose Existing Artwork'));
 fireEvent.click(screen.getByRole('button', { name: 'Save Garment', exact: true }));
 await screen.findByText('Next page');
 expect(getPendingCustomerRequest().lineItems.at(-1)).toMatchObject({ artworkMode: 'upload', artworkId: 'logo' });
});
