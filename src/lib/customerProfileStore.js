import {
  createStoredCustomer,
  getStoredCustomers,
  updateStoredCustomer,
} from "./customersStore";
import { normalizeCustomerId } from "./customerIds";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

export async function ensureCustomerProfile(session = {}) {
  const email = normalizeEmail(session.email);
  if (!email) return null;

  const customers = getStoredCustomers();
  const existingCustomer = customers.find(
    (customer) => normalizeEmail(customer.email) === email
  );

  const name = normalizeText(
    session.displayName ||
      [session.firstName, session.lastName].filter(Boolean).join(" ")
  );

  if (existingCustomer) {
    const nextName = name || existingCustomer.name || "Customer Account";
    const nextEmail = session.email || existingCustomer.email || "";
    const nextPhone = session.phone || existingCustomer.phone || "";
    const nextAuthUserId = session.id || existingCustomer.auth_user_id || "";
    const nextExternalReference = session.id || existingCustomer.external_reference || "";
    const isUnchanged =
      existingCustomer.name === nextName &&
      existingCustomer.email === nextEmail &&
      existingCustomer.phone === nextPhone &&
      existingCustomer.auth_user_id === nextAuthUserId &&
      existingCustomer.external_reference === nextExternalReference;

    if (isUnchanged) {
      return existingCustomer;
    }

    return updateStoredCustomer(existingCustomer.id, {
      id: normalizeCustomerId(existingCustomer.id),
      name: nextName,
      email: nextEmail,
      phone: nextPhone,
      auth_user_id: nextAuthUserId,
      external_reference: nextExternalReference,
    });
  }

  return createStoredCustomer({
    name: name || session.email || "Customer Account",
    email: session.email || "",
    phone: session.phone || "",
    auth_user_id: session.id || "",
    external_reference: session.id || "",
  });
}
