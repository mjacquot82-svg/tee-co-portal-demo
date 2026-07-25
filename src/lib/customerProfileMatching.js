function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function hasPhone(customer) {
  return /\d/.test(normalizeText(customer?.phone));
}

function hasRealName(customer) {
  return isValidCustomerName(customer?.name);
}

function findPreferredCustomer(customers, predicate) {
  const matches = customers.filter(predicate);
  return (
    matches.find((customer) => hasPhone(customer) && hasRealName(customer)) ||
    matches.find(hasRealName) ||
    matches.find(hasPhone) ||
    matches[0] ||
    null
  );
}

export function findCustomerProfileForSession(session, customers = []) {
  if (!session || !Array.isArray(customers)) return null;

  const sessionId = normalizeText(session.id);
  const sessionEmail = normalizeEmail(session.email);
  const sessionName = normalizeName(session.displayName);

  if (sessionId) {
    const linkedProfile = findPreferredCustomer(customers, (customer) => {
      const authUserId = normalizeText(customer.auth_user_id);
      const externalReference = normalizeText(customer.external_reference);
      return authUserId === sessionId || externalReference === sessionId;
    });
    if (linkedProfile) return linkedProfile;
  }

  if (sessionEmail) {
    const emailProfile = findPreferredCustomer(
      customers,
      (customer) => normalizeEmail(customer.email) === sessionEmail
    );
    if (emailProfile) return emailProfile;
  }

  if (sessionName) {
    return findPreferredCustomer(
      customers,
      (customer) => normalizeName(customer.name) === sessionName
    );
  }

  return null;
}
import { isValidCustomerName } from "./customerName";
