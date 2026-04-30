const STORAGE_KEY = "teeCoStaffOrders";

export function getStoredOrders() {
  if (typeof window === "undefined") return [];

  try {
    const rawOrders = window.localStorage.getItem(STORAGE_KEY);
    return rawOrders ? JSON.parse(rawOrders) : [];
  } catch (error) {
    console.error("Unable to read stored Tee & Co orders", error);
    return [];
  }
}

export function saveStoredOrders(orders) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function createStoredOrder(orderInput) {
  const currentOrders = getStoredOrders();
  const orderNumber = `TC-${Date.now().toString().slice(-6)}`;
  const createdAt = new Date().toISOString();

  const order = {
    ...orderInput,
    order_number: orderNumber,
    status: orderInput.status || "Awaiting Artwork",
    date: new Date(createdAt).toLocaleDateString(),
    created_at: createdAt,
    source: orderInput.source || "Staff Entry",
  };

  const nextOrders = [order, ...currentOrders];
  saveStoredOrders(nextOrders);
  return order;
}

export function findStoredOrder(orderNumber) {
  return getStoredOrders().find((order) => order.order_number === orderNumber);
}

export function updateStoredOrder(orderNumber, updates) {
  const currentOrders = getStoredOrders();
  const nextOrders = currentOrders.map((order) =>
    order.order_number === orderNumber
      ? {
          ...order,
          ...updates,
          updated_at: new Date().toISOString(),
        }
      : order
  );

  saveStoredOrders(nextOrders);
  return nextOrders.find((order) => order.order_number === orderNumber);
}
