import { useSyncExternalStore } from "react";
import {
  getJsonStorageItem,
  hasBrowserStorage,
  setJsonStorageItem,
} from "./browserStorage";

const STORAGE_KEY = "teeCoCustomers";
const customerListeners = new Set();
const EMPTY_CUSTOMERS = [];

function emitCustomersUpdated() {
  customerListeners.forEach((listener) => listener());
}

export function getStoredCustomers() {
  if (!hasBrowserStorage()) return EMPTY_CUSTOMERS;

  const customers = getJsonStorageItem(STORAGE_KEY, EMPTY_CUSTOMERS);
  return Array.isArray(customers) ? customers : EMPTY_CUSTOMERS;
}

export function saveStoredCustomers(customers) {
  if (!hasBrowserStorage()) return;
  const saved = setJsonStorageItem(STORAGE_KEY, customers);
  if (saved) {
    emitCustomersUpdated();
  }
  return saved;
}

export function subscribeToStoredCustomers(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  customerListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      customerListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    customerListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStoredCustomers() {
  return useSyncExternalStore(
    subscribeToStoredCustomers,
    getStoredCustomers,
    () => EMPTY_CUSTOMERS
  );
}

export function createStoredCustomer(customerInput) {
  const currentCustomers = getStoredCustomers();
  const createdAt = new Date().toISOString();

  const customer = {
    id: `customer-${Date.now()}`,
    name: customerInput.name || "New Customer",
    company: customerInput.company || "",
    phone: customerInput.phone || "",
    email: customerInput.email || "",
    auth_user_id: customerInput.auth_user_id || "",
    external_reference: customerInput.external_reference || "",
    notes: customerInput.notes || "",
    order_numbers: customerInput.order_numbers || [],
    created_at: createdAt,
    updated_at: createdAt,
  };

  const nextCustomers = [customer, ...currentCustomers];
  if (!saveStoredCustomers(nextCustomers)) {
    throw new Error("Unable to save customer. Browser storage write failed.");
  }
  return customer;
}

export function updateStoredCustomer(customerId, updates) {
  const currentCustomers = getStoredCustomers();
  const nextCustomers = currentCustomers.map((customer) =>
    customer.id === customerId
      ? {
          ...customer,
          ...updates,
          updated_at: new Date().toISOString(),
        }
      : customer
  );

  if (!saveStoredCustomers(nextCustomers)) {
    throw new Error("Unable to update customer. Browser storage write failed.");
  }
  return nextCustomers.find((customer) => customer.id === customerId);
}

export function findStoredCustomer(customerId) {
  return getStoredCustomers().find((customer) => customer.id === customerId);
}

export function linkOrderToCustomer(customerId, orderNumber) {
  const customer = findStoredCustomer(customerId);
  if (!customer) return null;

  const orderNumbers = new Set(customer.order_numbers || []);
  orderNumbers.add(orderNumber);

  return updateStoredCustomer(customerId, {
    order_numbers: Array.from(orderNumbers),
  });
}
