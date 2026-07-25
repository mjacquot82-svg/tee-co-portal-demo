const GENERIC_CUSTOMER_NAMES = new Set([
  "customer",
  "customer account",
  "customer identity unavailable",
  "new customer",
  "unnamed customer",
  "walk-in customer",
]);

export function normalizeCustomerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isValidCustomerName(value) {
  const name = normalizeCustomerName(value);
  if (!name) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return false;
  return !GENERIC_CUSTOMER_NAMES.has(name.toLowerCase());
}
