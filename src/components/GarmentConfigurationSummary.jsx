export default function GarmentConfigurationSummary({ color, decorationType, sizeBreakdown = {} }) {
  const sizes = Object.entries(sizeBreakdown).filter(([, quantity]) => Number(quantity) > 0);
  const totalPieces = sizes.reduce((total, [, quantity]) => total + Number(quantity), 0);

  return (
    <div data-testid="garment-configuration-summary" style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
        <div><span style={{ display: "block", color: "#78716c", fontSize: "12px" }}>Color</span><strong>{color || "Open / flexible"}</strong></div>
        <div><span style={{ display: "block", color: "#78716c", fontSize: "12px" }}>Decoration</span><strong>{decorationType || "Confirm later"}</strong></div>
        <div><span style={{ display: "block", color: "#78716c", fontSize: "12px" }}>Total Pieces</span><strong>{totalPieces}</strong></div>
      </div>
      <div>
        <span style={{ display: "block", marginBottom: "6px", color: "#78716c", fontSize: "12px" }}>Size Breakdown</span>
        {sizes.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {sizes.map(([size, quantity]) => <span key={size} style={{ padding: "7px 10px", borderRadius: "999px", border: "1px solid #d6d3d1", background: "#ffffff", fontWeight: 700 }}>{size} ×{Number(quantity)}</span>)}
          </div>
        ) : <strong>No sizes configured</strong>}
      </div>
    </div>
  );
}
