export const DEFAULT_SALES_TAX_RATE = 0.13;

export function roundCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function calculateInvoiceTax(
  subtotal,
  { taxRate = DEFAULT_SALES_TAX_RATE, taxExempt = false } = {}
) {
  const normalizedSubtotal = Math.max(0, roundCurrency(subtotal));
  const normalizedRate = taxExempt ? 0 : Math.max(0, Number(taxRate) || 0);
  const taxAmount = roundCurrency(normalizedSubtotal * normalizedRate);

  return {
    subtotal: normalizedSubtotal,
    tax_rate: normalizedRate,
    tax_amount: taxAmount,
    total_amount: roundCurrency(normalizedSubtotal + taxAmount),
  };
}
