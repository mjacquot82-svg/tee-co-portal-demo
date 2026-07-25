export default function OrderCart({ lineItems = [], onReviewRequest }) {
  const garmentCount = lineItems.length;
  const totalPieces = lineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const estimatedStartingPrice = lineItems.reduce(
    (total, item) => total + Number(item.estimatedStartingPrice || 0),
    0
  );

  return (
    <aside aria-label="Current order cart" data-testid="order-cart" style={{ maxWidth: "1240px", margin: "14px auto 0", padding: "0 24px", boxSizing: "border-box" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "center", padding: "16px 18px", borderRadius: "18px", border: "1px solid #d6d3d1", background: "#ffffff", boxShadow: "0 8px 24px rgba(28, 25, 23, 0.08)" }}>
        <div style={{ display: "grid", gap: "10px" }}>
          <strong style={{ fontSize: "17px" }}>Current Order</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", color: "#44403c" }}>
            <span><strong>{garmentCount}</strong> {garmentCount === 1 ? "Garment" : "Garments"}</span>
            <span><strong>{totalPieces}</strong> Total Pieces</span>
            <span><strong>{estimatedStartingPrice > 0 ? `$${estimatedStartingPrice.toFixed(2)}` : "Pending"}</strong> Estimated Starting Price</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {lineItems.map((item) => (
              <span key={item.id} style={{ padding: "6px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#166534", fontWeight: 700 }}>✓ {item.garmentName || "Configured Garment"}</span>
            ))}
            {!garmentCount ? <span style={{ color: "#78716c" }}>No garments added yet</span> : null}
          </div>
        </div>
        <button type="button" onClick={onReviewRequest} disabled={!garmentCount} style={{ padding: "11px 16px", borderRadius: "12px", border: "none", background: garmentCount ? "#171717" : "#e7e5e4", color: garmentCount ? "#ffffff" : "#78716c", fontWeight: 800, cursor: garmentCount ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>Review Request</button>
      </div>
    </aside>
  );
}
