import { afterEach, expect, test, vi } from 'vitest';
import { normalizePaymentHistory } from './orderFinancials';
afterEach(() => vi.useRealTimers());
test('legacy payment identities stay stable across reloads, preserving distinct entries', () => {
  vi.useFakeTimers();
  const history = [{ amount: 150, method: 'E-Transfer' }, { amount: 150, method: 'E-Transfer' }];
  const order = { order_number: 'QA-LEGACY', updated_at: '2026-01-01T12:00:00Z' };
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  const first = normalizePaymentHistory(history, order);
  vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  const second = normalizePaymentHistory(history, order);
  expect(second.map(payment => payment.id)).toEqual(first.map(payment => payment.id));
  expect(new Set(second.map(payment => payment.id)).size).toBe(2);
  expect(second.map(payment => payment.id)).toEqual(['legacy-payment-0', 'legacy-payment-1']);
  expect(normalizePaymentHistory([{ id: 'existing-payment', amount: 150 }], order)[0].id).toBe('existing-payment');
});
