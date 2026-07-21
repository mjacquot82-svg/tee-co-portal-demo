function positiveInteger(value) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function normalizeSizeBreakdown(sizeBreakdown = {}) {
  return Object.entries(sizeBreakdown || {}).reduce((result, [size, quantity]) => {
    const normalizedSize = String(size || "").trim();
    const normalizedQuantity = positiveInteger(quantity);
    if (normalizedSize && normalizedQuantity) result[normalizedSize] = normalizedQuantity;
    return result;
  }, {});
}

export function getLineItemQuantity(lineItem = {}) {
  const sizeQuantity = Object.values(normalizeSizeBreakdown(lineItem.size_breakdown)).reduce(
    (total, quantity) => total + quantity,
    0
  );
  return sizeQuantity || positiveInteger(lineItem.quantity || lineItem.qty);
}

export function normalizeOrderLineItem(lineItem = {}, index = 0) {
  const sizeBreakdown = normalizeSizeBreakdown(lineItem.size_breakdown);
  const placements = Array.isArray(lineItem.placements) ? lineItem.placements : [];
  return {
    id: lineItem.id || `line-item-${index + 1}`,
    product_id: lineItem.product_id || "",
    garment: lineItem.garment || lineItem.item || "Custom garment",
    category: lineItem.category || "",
    product_image: lineItem.product_image || "",
    selected_color: lineItem.selected_color || lineItem.color || "",
    decoration_type: lineItem.decoration_type || "",
    placement: lineItem.placement || placements[0]?.placement || "",
    placements,
    size_breakdown: sizeBreakdown,
    quantity: getLineItemQuantity({ ...lineItem, size_breakdown: sizeBreakdown }),
  };
}

export function getOrderLineItems(order = {}) {
  if (Array.isArray(order.line_items) && order.line_items.length) {
    return order.line_items.map(normalizeOrderLineItem);
  }

  if (!order.garment && !order.item && !order.product_id) return [];
  return [
    normalizeOrderLineItem({
      product_id: order.product_id,
      garment: order.garment || order.item,
      category: order.category,
      product_image: order.product_image,
      selected_color: order.selected_color,
      decoration_type: order.decoration_type,
      placement: order.placement,
      placements: order.placements,
      size_breakdown: order.size_breakdown,
      quantity: order.qty || order.quantity,
    }),
  ];
}

export function getOrderTotalQuantity(order = {}) {
  const lineItems = getOrderLineItems(order);
  return lineItems.length
    ? lineItems.reduce((total, lineItem) => total + getLineItemQuantity(lineItem), 0)
    : positiveInteger(order.qty || order.quantity);
}
