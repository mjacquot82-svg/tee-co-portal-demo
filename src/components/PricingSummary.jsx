function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPrice(value, isAvailable = true) {
  if (!isAvailable) return "Price unavailable";
  return money(value);
}

function sectionStyle(compact) {
  return {
    padding: compact ? "12px" : "14px",
    borderRadius: "16px",
    background: "#f8fafc",
    border: "1px solid #dbe4ee",
    display: "grid",
    gap: compact ? "8px" : "10px",
  };
}

function rowStyle(emphasized = false) {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "12px",
    color: emphasized ? "#0f172a" : "#334155",
    fontSize: "14px",
  };
}

export default function PricingSummary({
  quote,
  quantity = 0,
  compact = false,
  mode = "detailed",
}) {
  if (!quote) return null;

  const productionUnitPrice = Number(
    quote.production_lines?.[0]?.unit_price || 0
  );
  const productionCharges =
    quote.production_charges_subtotal ?? quote.production_method_subtotal ?? 0;
  const additionalFees =
    quote.additional_fees_subtotal ?? quote.setup_subtotal ?? 0;
  const resolvedQuantity = quantity || quote.quantity || 0;
  const customerTotal = quote.garment_pricing_available
    ? quote.garment_subtotal
    : quote.total;

  if (mode === "customer") {
    return (
      <div
        style={{
          display: "grid",
          gap: compact ? "10px" : "12px",
          borderRadius: "20px",
          background: "#171717",
          color: "#ffffff",
          padding: compact ? "18px" : "22px",
        }}
      >
        <span style={{ fontSize: compact ? "13px" : "14px", opacity: 0.78 }}>
          Order Total
        </span>
        <strong style={{ fontSize: compact ? "28px" : "32px", lineHeight: 1 }}>
          {formatPrice(customerTotal, quote.garment_pricing_available)}
        </strong>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: compact ? "12px" : "14px" }}>
      <div style={sectionStyle(compact)}>
        <div style={rowStyle()}>
          <span>Garment base price</span>
          <strong>{formatPrice(quote.garment_unit_price, quote.garment_pricing_available)}</strong>
        </div>
        <div style={rowStyle()}>
          <span>Quantity</span>
          <strong>{resolvedQuantity}</strong>
        </div>
        <div style={rowStyle(true)}>
          <span>Garment subtotal</span>
          <strong>{formatPrice(quote.garment_subtotal, quote.garment_pricing_available)}</strong>
        </div>
      </div>

      <div style={sectionStyle(compact)}>
        <div style={rowStyle(true)}>
          <span>Placement charges</span>
          <strong>{money(quote.placement_subtotal)}</strong>
        </div>

        {quote.placement_lines?.length ? (
          <div style={{ display: "grid", gap: "8px" }}>
            {quote.placement_lines.map((line) => (
              <div
                key={`${line.placement}-${line.decoration_type}`}
                style={{
                  ...rowStyle(),
                  borderTop: "1px dashed #cbd5e1",
                  paddingTop: "8px",
                }}
              >
                <span>
                  {line.placement} ({money(line.unit_price)} each)
                </span>
                <span>{money(line.line_total)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            No placements selected.
          </p>
        )}
      </div>

      <div style={sectionStyle(compact)}>
        <div style={rowStyle(true)}>
          <span>Production charges</span>
          <strong>{money(productionCharges)}</strong>
        </div>
        <div style={rowStyle()}>
          <span>{quote.production_method || "Production method"}</span>
          <span>
            {resolvedQuantity} x {money(productionUnitPrice)}
          </span>
        </div>
      </div>

      <div style={sectionStyle(compact)}>
        <div style={rowStyle(true)}>
          <span>Additional fees</span>
          <strong>{money(additionalFees)}</strong>
        </div>
        <div style={rowStyle()}>
          <span>Digitizing / setup</span>
          <span>{money(quote.setup_subtotal || 0)}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "12px",
          borderRadius: "18px",
          background: "#171717",
          color: "#ffffff",
          padding: compact ? "14px 16px" : "16px 18px",
        }}
      >
        <span>Grand Total</span>
        <strong style={{ fontSize: compact ? "20px" : "24px" }}>
          {formatPrice(quote.total, quote.garment_pricing_available)}
        </strong>
      </div>
    </div>
  );
}
