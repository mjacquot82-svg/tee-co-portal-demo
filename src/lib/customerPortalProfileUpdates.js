import { getStoredCustomers, updateStoredCustomer } from "./customersStore";
import { customerIdsEqual } from "./customerIds";

function normalizeEditableText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeIdentityText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeIdentityText(value).toLowerCase();
}

export function findWritableCustomerProfileForSession(session, customers = []) {
  if (!session || !Array.isArray(customers)) return null;

  const sessionId = normalizeIdentityText(session.id || session.userId);
  const sessionEmail = normalizeEmail(session.email);

  return (
    customers.find((customer) => {
      const customerId = normalizeIdentityText(customer.id || customer.customer_id);
      const customerAuthId = normalizeIdentityText(customer.auth_user_id);
      const customerExternalReference = normalizeIdentityText(customer.external_reference);
      const customerEmail = normalizeEmail(customer.email);

      if (sessionId) {
        if (
          customerIdsEqual(customerId, sessionId) ||
          customerAuthId === sessionId ||
          customerExternalReference === sessionId
        ) {
          return true;
        }
      }

      return Boolean(sessionEmail) && customerEmail === sessionEmail;
    }) || null
  );
}

export function buildCustomerPortalProfileUpdates(updates = {}) {
  return {
    name: normalizeEditableText(updates.name) || "Customer Account",
    phone: normalizeEditableText(updates.phone),
    company: normalizeEditableText(updates.company),
  };
}

export async function updateCustomerPortalProfile(session, updates = {}) {
  const profile = findWritableCustomerProfileForSession(session, getStoredCustomers());

  if (!profile) {
    throw new Error("We could not verify this profile for editing. Sign out and back in, then try again.");
  }

  return updateStoredCustomer(profile.id, buildCustomerPortalProfileUpdates(updates));
}
