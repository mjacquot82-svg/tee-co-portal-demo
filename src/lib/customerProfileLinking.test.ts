import { beforeEach, expect, test, vi } from 'vitest';

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

const session = { id: 'auth-1', email: 'c@example.test', displayName: 'Casey Customer', phone: '5195550142' };
const linked = { id: 'cust-1', name: 'Casey Customer', email: 'c@example.test', phone: '5195550142', auth_user_id: 'auth-1', external_reference: 'auth-1' };

beforeEach(() => { store.customers = []; store.create.mockReset(); store.fetchLinked.mockReset(); store.update.mockClear(); });

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
