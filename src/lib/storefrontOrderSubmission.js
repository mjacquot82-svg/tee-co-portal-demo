import { getCartTotal } from "./cartStore";
import { ensureCustomerProfile } from "./customerProfileStore";
import { linkOrderToCustomer } from "./customersStore";
import { createStoredOrder } from "./ordersStore";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeQuantity(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 1;
  return Math.max(1, Math.round(parsedValue));
}

function normalizePrice(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return 0;
  return Number(parsedValue.toFixed(2));
}

function normalizeCartItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: normalizeText(item.id),
      productId: normalizeText(item.productId || item.product_id),
      garmentId: normalizeText(item.garmentId || item.garment_id),
      name: normalizeText(item.name) || "Catalog Product",
      brand: normalizeText(item.brand),
      category: normalizeText(item.category),
      imageSrc: normalizeText(item.imageSrc || item.image_src),
      selectedColor: normalizeText(item.selectedColor || item.selected_color) || "Default",
      selectedSize: normalizeText(item.selectedSize || item.selected_size) || "Default",
      quantity: normalizeQuantity(item.quantity),
      unitPrice: normalizePrice(item.unitPrice ?? item.unit_price),
    }))
    .filter((item) => item.productId || item.name);
}

function buildCartSummary(items = []) {
  return items
    .map(
      (item) =>
        `- ${item.name} (${item.selectedColor} / ${item.selectedSize}) x${item.quantity} @ $${item.unitPrice.toFixed(2)}`
    )
    .join("\n");
}

export async function submitStorefrontOrder({ customerSession, cartItems = [] } = {}) {
  if (!customerSession) {
    throw new Error("A customer account is required before submitting a request.");
  }

  const normalizedItems = normalizeCartItems(cartItems);
  if (!normalizedItems.length) {
    throw new Error("Add at least one product to the request before submission.");
  }

  const profile = await ensureCustomerProfile(customerSession);
  const primaryItem = normalizedItems[0];
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = Number(getCartTotal(normalizedItems).toFixed(2));
  const itemCount = normalizedItems.length;
  const productSummary =
    itemCount === 1
      ? primaryItem.name
      : `${primaryItem.name} + ${itemCount - 1} more item${itemCount - 1 === 1 ? "" : "s"}`;
  const detailedSummary = buildCartSummary(normalizedItems);
  const checkoutNotes = `Customer request received from the storefront request builder.\n\nItems:\n${detailedSummary}`;

  const createdOrder = createStoredOrder({
    customer_id: profile?.id || "",
    customer_name: profile?.name || customerSession.displayName || "Customer Account",
    customer_email: customerSession.email || profile?.email || "",
    customer_phone: profile?.phone || customerSession.phone || "",
    customer_company: profile?.company || "",
    contact_name: customerSession.displayName || profile?.name || "",
    source: "Storefront Request",
    request_type: "Product Request",
    status: "New",
    quote_status: "Draft",
    operational_visible: false,
    production_ready: false,
    product_id: primaryItem.productId || primaryItem.garmentId || "",
    garment: productSummary,
    category: itemCount === 1 ? primaryItem.category || "Storefront" : "Storefront Purchase",
    product_image: primaryItem.imageSrc || "",
    product_notes: detailedSummary,
    qty: totalQuantity,
    selected_color: itemCount === 1 ? primaryItem.selectedColor : "Multiple",
    selected_size: itemCount === 1 ? primaryItem.selectedSize : "Multiple",
    size_breakdown:
      itemCount === 1 && primaryItem.selectedSize
        ? { [primaryItem.selectedSize]: primaryItem.quantity }
        : {},
    notes: checkoutNotes,
    customer_notes: checkoutNotes,
    request_details: checkoutNotes,
    cart_items: normalizedItems,
    subtotal: cartTotal,
    tax_amount: 0,
    total_amount: cartTotal,
    total: cartTotal,
    payment_history: [],
    total_paid: 0,
    amount_paid: 0,
    balance_due: cartTotal,
    deposit_amount: 0,
    deposit_required: false,
    invoice_status: "Draft",
    artwork_approval_required: false,
    request_completion_status: "pending_completion",
    artwork_intent: "",
  });

  if (profile?.id) {
    await linkOrderToCustomer(profile.id, createdOrder.order_number);
  }

  return {
    createdOrder,
    profile,
    cartItems: normalizedItems,
    cartTotal,
    totalQuantity,
  };
}
