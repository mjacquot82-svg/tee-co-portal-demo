import { expect, test, vi } from 'vitest';
const captured = vi.hoisted(() => ({ payload: null as any }));
vi.mock('./supabase', () => ({ supabase: { from: () => ({
  upsert: (payload: any) => { captured.payload = payload; return {
    select: () => ({ single: async () => ({ data: payload, error: null }) }),
  }; },
}) } }));
vi.mock('./customerTimelineStore', () => ({ addCustomerTimelineEvent: vi.fn() }));
import { createStoredCustomer } from './customersStore';
test('new customers persist UUID identifiers and existing identifiers are preserved', async () => {
  const customer = await createStoredCustomer({ name: 'QA Customer', phone: '5195550100' });
  expect(captured.payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(customer.id).toBe(captured.payload.id);
  await createStoredCustomer({ id: 'customer-123', name: 'Existing Customer' });
  expect(captured.payload.id).toBe('customer-123');
});
