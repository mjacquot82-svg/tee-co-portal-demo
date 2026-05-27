import { getStoredCustomers } from "./customersStore";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/\D/g, "");
}

export function matchesCustomerRecord(customer, record) {
  if (!customer) return false;

  if (customer.id && record.customer_id && customer.id === record.customer_id) {
    return true;
  }

  const customerName = normalize(customer.name);
  const customerEmail = normalize(customer.email);
  const customerPhone = normalizePhone(customer.phone);
  const recordName = normalize(record.customer_name || record.name);
  const recordEmail = normalize(record.customer_email || record.email);
  const recordPhone = normalizePhone(record.phone);
  const linkedNumbers = new Set(customer.order_numbers || []);

  if (record.order_number && linkedNumbers.has(record.order_number)) {
    return true;
  }

  if (customerName && recordName && customerName === recordName) {
    return true;
  }

  if (customerEmail && recordEmail && customerEmail === recordEmail) {
    return true;
  }

  if (customerPhone && recordPhone && customerPhone === recordPhone) {
    return true;
  }

  return false;
}

export function resolveCustomerForRecord(record, customers = getStoredCustomers()) {
  return customers.find((customer) => matchesCustomerRecord(customer, record)) || null;
}
