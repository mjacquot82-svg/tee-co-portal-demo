import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  customers: [] as Row[],
  create: vi.fn(),
  fetchLinked: vi.fn(),
  update: vi.fn(async (_id: string, updates: Row) => ({ ...updates })),
}));
vi.mock('./customersStore', () => ({
  getStoredCustomers: () => store.customers,
  createStoredCustomer: store.create,
  updateStoredCustomer: store.update,
  fetchLinkedCustomerByAuthUserId: store.fetchLinked,
  isCustomerUniqueConflict: (e: { code?: string; status?: number } | null) => e?.code === '23505' || e?.status === 409,
}));
import { ensureCustomerProfile } from './customerProfileStore';
import PricingSummary from '../components/PricingSummary';
import { generateOrderQuoteSnapshot } from './quoteEngine';

const session = { id: 'auth-1', email: 'c@example.test', displayName: 'Casey Customer', phone: '5195550142' };
const linked = { id: 'cust-1', name: 'Casey Customer', email: 'c@example.test', phone: '5195550142', auth_user_id: 'auth-1', external_reference: 'auth-1' };

beforeEach(() => { store.customers = []; store.create.mockReset(); store.fetchLinked.mockReset(); store.update.mockClear(); });
afterEach(cleanup);

test('empty local list (loaded before sign-in): finds the linked customer and never creates', async () => {
  store.fetchLinked.mockImplementation(async () => { store.customers = [linked]; return linked; });
  const profile = await ensureCustomerProfile(session);
  expect(profile?.id).toBe('cust-1');
  expect(store.fetchLinked).toHaveBeenCalledWith('auth-1');
  expect(store.create).not.toHaveBeenCalled();
});

test('create conflict (409/23505) is treated as already-exists: re-fetches the saved row', async () => {
  store.fetchLinked.mockResolvedValueOnce(null).mockResolvedValueOnce(linked);
  store.create.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "customers_auth_user_id_unique_idx"' });
  const profile = await ensureCustomerProfile(session);
  expect(profile?.id).toBe('cust-1');
  expect(store.create).toHaveBeenCalledOnce();
});

test('a real create failure still blocks honestly (throws)', async () => {
  store.fetchLinked.mockResolvedValue(null);
  store.create.mockRejectedValue(new Error('network down'));
  await expect(ensureCustomerProfile(session)).rejects.toThrow('network down');
});

test('conflict with no readable linked row still throws (no silent success)', async () => {
  store.fetchLinked.mockResolvedValue(null);
  store.create.mockRejectedValue({ code: '23505', message: 'duplicate key' });
  await expect(ensureCustomerProfile(session)).rejects.toMatchObject({ code: '23505' });
});

test('concurrent calls for the same user share one ensure (single create)', async () => {
  store.fetchLinked.mockResolvedValue(null);
  store.create.mockImplementation(async () => ({ ...linked }));
  const [a, b] = await Promise.all([ensureCustomerProfile(session), ensureCustomerProfile(session)]);
  expect(a).toBe(b);
  expect(store.create).toHaveBeenCalledOnce();
});

test('success page total equals the final-review estimate (quote.total incl. tax)', () => {
  const products = [{ id: 'shirt', name: 'Test Shirt', status: 'Active', colors: ['Black'], sizes: ['M', 'L'], placements: ['Front'], decoration_type: 'DTF', base_garment_price: 10 }];
  const quote = generateOrderQuoteSnapshot({ line_items: [{ id: 'a', product_id: 'shirt', garment: 'Test Shirt', size_breakdown: { M: 3, L: 2 }, quantity: 5, decoration_type: 'DTF' }], setup_fees: [] }, products);
  expect(quote.total).toBeGreaterThan(quote.garment_subtotal);
  render(<PricingSummary quote={quote} quantity={5} compact mode="customer" />);
  expect(screen.getByText(/Estimated Total/)).toBeTruthy();
  expect(screen.getByText(`$${Number(quote.total).toFixed(2)}`)).toBeTruthy();
  expect(screen.queryByText(`$${Number(quote.garment_subtotal).toFixed(2)}`)).toBeNull();
});
