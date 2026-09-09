import { validateCustomerIdentity } from "./customerIdentity";
import { getLineItemQuantity, normalizeSizeBreakdown } from "./orderLineItems";
import {
  getProductDecorationOptions,
} from "./orderConfiguration";
import { getProductPlacementConfig } from "./productsStore";
import { generateOrderQuoteSnapshot } from "./quoteEngine";

export const STAFF_ORDER_SOURCE = "Staff Portal";
export const STAFF_ORDER_PAYMENT_STATUS = "unpaid";

function text(value) {
  return String(value || "").trim();
}

function optionValue(value) {
  return typeof value === "string" ? text(value) : text(value?.name || value?.label);
}

function includesOption(options, value) {
  const normalizedValue = text(value).toLowerCase();
  return (Array.isArray(options) ? options : []).some(
    (option) => optionValue(option).toLowerCase() === normalizedValue
  );
}

function badRequest(message, code = "INVALID_STAFF_ORDER") {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

export function validateStaffOrderLineItems(lineItems = [], products = []) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw badRequest("Add at least one product to the order.", "LINE_ITEMS_REQUIRED");
  }

  const productsById = new Map(products.map((product) => [text(product.id), product]));

  return lineItems.map((input, index) => {
    const product = productsById.get(text(input?.product_id));
    if (!product || text(product.status).toLowerCase() === "inactive") {
      throw badRequest(
        `Line ${index + 1} uses a product that is no longer available. Refresh the catalog and choose another product.`,
        "PRODUCT_UNAVAILABLE"
      );
    }

    const sizeBreakdown = normalizeSizeBreakdown(input.size_breakdown);
    const quantity = getLineItemQuantity({ ...input, size_breakdown: sizeBreakdown });
    if (quantity < 1) {
      throw badRequest(`Line ${index + 1} needs at least one size and quantity.`, "QUANTITY_REQUIRED");
    }

    const allowedSizes = Array.isArray(product.sizes) ? product.sizes : [];
    const invalidSize = Object.keys(sizeBreakdown).find(
      (size) => allowedSizes.length && !includesOption(allowedSizes, size)
    );
    if (invalidSize) {
      throw badRequest(`Line ${index + 1} uses unavailable size ${invalidSize}.`, "INVALID_SIZE");
    }

    const selectedColor = text(input.selected_color);
    if (selectedColor && Array.isArray(product.colors) && product.colors.length && !includesOption(product.colors, selectedColor)) {
      throw badRequest(`Line ${index + 1} uses an unavailable color.`, "INVALID_COLOR");
    }

    const decorationType = text(input.decoration_type);
    const decorationOptions = getProductDecorationOptions(product);
    if (!decorationType || !includesOption(decorationOptions, decorationType)) {
      throw badRequest(`Line ${index + 1} uses an unavailable decoration method.`, "INVALID_DECORATION");
    }

    const placement = text(input.placement);
    const placementOptions = getProductPlacementConfig(product);
    if (placement && !includesOption(placementOptions, placement)) {
      throw badRequest(`Line ${index + 1} uses an unavailable placement.`, "INVALID_PLACEMENT");
    }

    return {
      id: text(input.id) || `line-item-${index + 1}`,
      product_id: text(product.id),
      garment: text(product.name),
      category: text(product.storefront_category || product.category),
      product_image: text(product.image),
      product_notes: text(product.notes),
      selected_color: selectedColor,
      decoration_type: decorationType,
      placement,
      placements: placement ? [{ placement, decoration_type: decorationType }] : [],
      size_breakdown: sizeBreakdown,
      quantity,
      production_notes: text(input.production_notes),
    };
  });
}

export function buildAuthoritativeStaffOrder({ input = {}, products = [], actor = {}, now = new Date(), orderNumber }) {
  const identityValidation = validateCustomerIdentity({
    customer_name: input.customer_name,
    customer_first_name: input.customer_first_name,
    customer_last_name: input.customer_last_name,
    customer_phone: input.customer_phone,
  });
  if (!identityValidation.valid) {
    throw badRequest(identityValidation.message, "CUSTOMER_IDENTITY_REQUIRED");
  }

  const lineItems = validateStaffOrderLineItems(input.line_items, products);
  const quote = generateOrderQuoteSnapshot({ line_items: lineItems, setup_fees: [] }, products);
  if (quote.subtotal === null || !Number.isFinite(Number(quote.total_amount))) {
    throw badRequest("Authoritative catalog pricing is unavailable for one or more products.", "PRICING_UNAVAILABLE");
  }

  const createdAt = now.toISOString();
  const primary = lineItems[0];
  const quantity = lineItems.reduce((total, item) => total + item.quantity, 0);
  const actorId = text(actor.id);
  const actorName = text(actor.name) || text(actor.email) || "Operational Staff";
  const actorRole = text(actor.role);
  const idempotencyKey = text(input.idempotency_key);
  const total = Number(quote.total_amount);

  return {
    order_number: text(orderNumber),
    customer_first_name: identityValidation.identity.firstName,
    customer_last_name: identityValidation.identity.lastName,
    customer_name: identityValidation.identity.displayName,
    customer_phone: identityValidation.identity.phone,
    customer_email: text(input.customer_email),
    company: text(input.customer_company),
    source: STAFF_ORDER_SOURCE,
    request_type: "Staff Manual Order",
    status: "New",
    quote_status: "Ready For Production",
    approval_status: "Approved",
    staff_review_status: "Approved",
    operational_visible: true,
    production_ready: true,
    needs_assignment: true,
    assigned_to_staff_id: actorId,
    assigned_to_staff_name: actorName,
    assigned_to_staff_role: actorRole,
    assigned_at: createdAt,
    created_by_staff_id: actorId,
    created_by_staff_name: actorName,
    created_by_staff_role: actorRole,
    product_id: primary.product_id,
    garment: lineItems.map((item) => item.garment).join(", "),
    product_image: primary.product_image,
    qty: quantity,
    selected_color: primary.selected_color,
    size_breakdown: primary.size_breakdown,
    line_items: lineItems,
    decoration_type: primary.decoration_type,
    placement: primary.placement,
    placements: primary.placements,
    due_date: text(input.due_date),
    notes: text(input.notes),
    internal_notes: text(input.internal_notes),
    quote,
    subtotal: Number(quote.subtotal),
    tax_rate: Number(quote.tax_rate),
    tax_amount: Number(quote.tax_amount),
    total_amount: total,
    total: total,
    payment_status: STAFF_ORDER_PAYMENT_STATUS,
    payment_collection_state: "Not Collected",
    payment_history: [],
    total_paid: 0,
    amount_paid: 0,
    balance_due: total,
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_requirement_status: "Not Required",
    deposit_workflow_status: "Deposit Not Required",
    deposit_amount: 0,
    invoice_status: "Open",
    artwork_approval_required: false,
    artwork_approval_status: "Not Required",
    artwork_status: "Not Required",
    order_metadata: {
      staff_create_idempotency_key: idempotencyKey,
      created_by_auth_user_id: actorId,
      created_by_staff_name: actorName,
      created_by_staff_role: actorRole,
      source: STAFF_ORDER_SOURCE,
    },
    activity_log: [
      {
        type: "created",
        note: `Order created in Staff Portal by ${actorName}.`,
        timestamp: createdAt,
        staff_id: actorId,
        staff_name: actorName,
        staff_role: actorRole,
      },
    ],
    created_at: createdAt,
    updated_at: createdAt,
  };
}
