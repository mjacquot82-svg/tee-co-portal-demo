import {
  createStoredCustomer,
  getStoredCustomers,
  updateStoredCustomer,
} from "./customersStore";
import { normalizeCustomerId } from "./customerIds";
import { findCustomerProfileForSession } from "./customerProfileMatching";
import {
  isValidCustomerName,
  normalizeCustomerName,
} from "./customerName";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveCustomerProfileIdentity(session = {}, existingCustomer = {}) {
  const fullName = normalizeCustomerName(
    [session.firstName, session.lastName].filter(Boolean).join(" ")
  );
  const displayName = normalizeCustomerName(session.displayName);
  const existingName = normalizeCustomerName(existingCustomer.name);
  const sessionName =
    (isValidCustomerName(fullName) && fullName) ||
    (isValidCustomerName(displayName) && displayName) ||
    "";

  return {
    name:
      (isValidCustomerName(existingName) && existingName) ||
      sessionName ||
      "Customer Account",
    email: normalizeText(session.email) || normalizeText(existingCustomer.email),
    phone: normalizeText(session.phone) || normalizeText(existingCustomer.phone),
  };
}

export async function ensureCustomerProfile(session = {}) {
  const email = normalizeEmail(session.email);
  if (!email) return null;

  const customers = getStoredCustomers();
  const existingCustomer = findCustomerProfileForSession(session, customers);

  if (existingCustomer) {
    const identity = resolveCustomerProfileIdentity(session, existingCustomer);
    const nextName = identity.name;
    const nextEmail = identity.email;
    const nextPhone = identity.phone;
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

  const identity = resolveCustomerProfileIdentity(session);
  return createStoredCustomer({
    name: identity.name,
    email: identity.email,
    phone: identity.phone,
    auth_user_id: session.id || "",
    external_reference: session.id || "",
  });
}
