const STORAGE_KEY = "teeCoCustomers";

export function getStoredCustomers() {
  if (typeof window === "undefined") return [];

  try {
    const rawCustomers = window.localStorage.getItem(STORAGE_KEY);
    return rawCustomers ? JSON.parse(rawCustomers) : [];
  } catch (error) {
    console.error("Unable to read Tee & Co customers", error);
    return [];
  }
}

export function saveStoredCustomers(customers) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
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
    notes: customerInput.notes || "",
    order_numbers: customerInput.order_numbers || [],
    created_at: createdAt,
    updated_at: createdAt,
  };

  const nextCustomers = [customer, ...currentCustomers];
  saveStoredCustomers(nextCustomers);
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

  saveStoredCustomers(nextCustomers);
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
