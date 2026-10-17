import {
  createStoredCustomer,
  fetchLinkedCustomerByAuthUserId,
  getStoredCustomers,
  isCustomerUniqueConflict,
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

// One in-flight ensure per signed-in user: the portal shell and the submit
// flow can call this at the same time.
const ensureInFlight = new Map();

export function ensureCustomerProfile(session = {}) {
  const key = normalizeText(session.id) || normalizeEmail(session.email);
  if (!key) return ensureCustomerProfileOnce(session);
  if (!ensureInFlight.has(key)) {
    ensureInFlight.set(
      key,
      ensureCustomerProfileOnce(session).finally(() => ensureInFlight.delete(key))
    );
  }
  return ensureInFlight.get(key);
}

async function lookUpLinkedCustomer(authUserId) {
  if (!authUserId) return null;
  try {
    return await fetchLinkedCustomerByAuthUserId(authUserId);
  } catch (error) {
    // Read failed (offline, not signed in yet): fall through; a create that
    // conflicts is still resolved by the re-fetch below.
    console.warn("Linked customer lookup failed", error);
    return null;
  }
}

async function ensureCustomerProfileOnce(session = {}) {
  const email = normalizeEmail(session.email);
  if (!email) return null;

  const authUserId = normalizeText(session.id);
  let customers = getStoredCustomers();
  let existingCustomer = findCustomerProfileForSession(session, customers);
  if (!existingCustomer && authUserId) {
    // The local list may be empty because it loaded before sign-in; look up
    // the row linked to this Auth user before creating anything.
    const linkedCustomer = await lookUpLinkedCustomer(authUserId);
    if (linkedCustomer) {
      customers = getStoredCustomers();
      existingCustomer = findCustomerProfileForSession(session, customers) || linkedCustomer;
    }
  }

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
  try {
    return await createStoredCustomer({
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
      auth_user_id: session.id || "",
      external_reference: session.id || "",
    });
  } catch (error) {
    // Already exists (unique auth_user_id): use the saved row, not a failure.
    if (authUserId && isCustomerUniqueConflict(error)) {
      const linkedCustomer = await fetchLinkedCustomerByAuthUserId(authUserId);
      if (linkedCustomer) return linkedCustomer;
    }
    throw error;
  }
}
