export function getPlacementUnitPrice(product, placementName, quantity = 0) {
  const priceConfig = product?.placement_prices?.[placementName];

  if (Array.isArray(priceConfig)) {
    const sortedTiers = [...priceConfig].sort((a, b) => Number(b.min || 0) - Number(a.min || 0));
    const matchingTier = sortedTiers.find((tier) => quantity >= Number(tier.min || 0));
    return Number(matchingTier?.price || 0);
  }

  return Number(priceConfig || 0);
}

export function normalizeOrderPlacements(order) {
  if (Array.isArray(order?.placements) && order.placements.length) {
    return order.placements;
  }

  if (order?.placement) {
    return [
      {
        placement: order.placement,
        decoration_type: order.decoration_type || "",
        artwork_id: order.customer_artwork_id || "",
        artwork_name: order.customer_artwork_name || "",
      },
    ];
  }

  return [];
}

export function generateQuoteSnapshot(order, product) {
  const quantity = Number(order?.qty || 0);
  const placements = normalizeOrderPlacements(order);

  const placement_lines = placements.map((line) => {
    const placementName = line.placement;
    const unitPrice = getPlacementUnitPrice(product, placementName, quantity);
    const lineTotal = unitPrice * quantity;

    return {
      placement: placementName,
      decoration_type: line.decoration_type || order?.decoration_type || "",
      artwork_id: line.artwork_id || "",
      artwork_name: line.artwork_name || "",
      unit_price: unitPrice,
      quantity,
      line_total: lineTotal,
    };
  });

  const setup_fees = Array.isArray(order?.setup_fees) ? order.setup_fees : [];
  const placementSubtotal = placement_lines.reduce((total, line) => total + Number(line.line_total || 0), 0);
  const setupSubtotal = setup_fees.reduce((total, fee) => total + Number(fee.amount || 0), 0);
  const subtotal = placementSubtotal + setupSubtotal;

  return {
    order_number: order?.order_number || "",
    customer_name: order?.customer_name || "",
    garment: order?.garment || product?.name || "",
    product_id: order?.product_id || product?.id || "",
    quantity,
    placement_lines,
    setup_fees,
    placement_subtotal: placementSubtotal,
    setup_subtotal: setupSubtotal,
    subtotal,
    tax: null,
    total: subtotal,
    generated_at: new Date().toISOString(),
  };
}
