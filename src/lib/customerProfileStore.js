import {
  createStoredCustomer,
  getStoredCustomers,
  saveStoredCustomers,
} from "./customersStore";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function ensureCustomerProfile(session = {}) {
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
    const nextCustomer = {
      ...existingCustomer,
      name: name || existingCustomer.name || "Customer Account",
      email: session.email || existingCustomer.email || "",
      phone: session.phone || existingCustomer.phone || "",
      auth_user_id: session.id || existingCustomer.auth_user_id || "",
      external_reference: session.id || existingCustomer.external_reference || "",
      updated_at: new Date().toISOString(),
    };

    saveStoredCustomers(
      customers.map((customer) =>
        customer.id === existingCustomer.id ? nextCustomer : customer
      )
    );

    return nextCustomer;
  }

  return createStoredCustomer({
    name: name || session.email || "Customer Account",
    email: session.email || "",
    phone: session.phone || "",
    auth_user_id: session.id || "",
    external_reference: session.id || "",
  });
}
