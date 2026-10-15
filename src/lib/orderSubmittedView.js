// Builds what the order-submitted page may show.
// Receipt mode (recovered/reconciled orders): only the verified order number,
// warnings and a My Orders link. Never draft values, quote or display defaults.

export const MY_ORDERS_PATH = "/portal/orders";

function text(value) {
  return String(value ?? "").trim();
}

export function buildSubmittedView(state = {}) {
  const orderNumber = text(state.createdOrderNumber || state.orderNumber || state.order_number);
  const followUps = Array.isArray(state.followUpWarnings) ? state.followUpWarnings.map(text) : [];
  const warnings = Array.from(
    new Set([text(state.artworkLinkWarning), text(state.recoveryWarning), ...followUps].filter(Boolean))
  );

  if (!orderNumber) return { mode: "missing" };

  if (state.receiptOnly) {
    return { mode: "receipt", orderNumber, warnings, myOrdersPath: MY_ORDERS_PATH };
  }

  return {
    mode: "full",
    orderNumber,
    warnings,
    garmentName: state.garmentName || "Selected Garment",
    brand: state.brand || "Tee & Co",
    category: state.category || "Apparel",
    selectedColor: state.selectedColor || "Black",
    selectedSize: state.selectedSize || "M",
    quantity: state.quantity || 1,
    artworkName: state.artworkName || "No artwork uploaded",
    notes: state.notes || "",
    quote: state.quote || null,
  };
}
