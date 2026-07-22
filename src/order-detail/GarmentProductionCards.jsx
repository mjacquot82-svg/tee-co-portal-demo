import { getOrderLineItems } from "../lib/orderLineItems";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getLineItemArtwork,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";

function Detail({ label, children }) {
  return (
    <div>
      <p style={{ margin: 0, color: "#64748b", fontSize: "11px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</p>
      <div style={{ marginTop: "5px", color: "#0f172a", fontWeight: 800, lineHeight: 1.45 }}>{children || "—"}</div>
    </div>
  );
}

export default function GarmentProductionCards({ order = {} }) {
  const lineItems = getOrderLineItems(order);

  return (
    <section data-testid="garment-production-cards" style={{ display: "grid", gap: "14px" }}>
      <div>
        <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>Manufacturing Details</p>
        <h2 style={{ margin: "5px 0 0" }}>Garments to Produce</h2>
      </div>

      {lineItems.length ? lineItems.map((lineItem, index) => {
        const artwork = getLineItemArtwork(order, lineItem) || (lineItems.length === 1 ? getOrderArtworkFiles(order)[0] : null);
        const artworkUrl = artwork ? getArtworkAssetUrl(artwork) : "";
        const sizes = Object.entries(lineItem.size_breakdown || {});
        const lineNotes = lineItem.production_notes || lineItem.manufacturing_instructions || "";
        const urgentNote = /urgent|warning|caution|rush/i.test(lineNotes);
        return (
          <article key={lineItem.id} data-testid="garment-production-card" style={{ background: "#ffffff", border: "3px solid #0f172a", borderRadius: "24px", padding: "28px", display: "grid", gap: "22px", boxShadow: "0 14px 36px rgba(15, 23, 42, 0.13)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Garment {index + 1}</p>
                <h3 style={{ margin: "4px 0 0", fontSize: "34px", letterSpacing: "-0.03em" }}>{lineItem.garment}</h3>
              </div>
              <strong style={{ fontSize: "38px", lineHeight: 1 }}>×{lineItem.quantity}</strong>
            </div>
            {urgentNote ? <div data-testid="garment-production-warning" style={{ border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: "12px", padding: "10px 12px", fontWeight: 900 }}>Production warning: {lineNotes}</div> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
              <Detail label="Color">{lineItem.selected_color}</Detail>
              <Detail label="Quantity">{lineItem.quantity}</Detail>
              <Detail label="Decoration Method">{lineItem.decoration_type || order.decoration_type}</Detail>
              <Detail label="Placement">{lineItem.placement || lineItem.placements?.map((entry) => entry.placement).filter(Boolean).join(", ")}</Detail>
              <div style={{ border: "2px solid #0f172a", background: "#f8fafc", borderRadius: "14px", padding: "12px", gridColumn: "span 2" }}><Detail label="Size Breakdown">{sizes.length ? sizes.map(([size, quantity]) => `${size}: ${quantity}`).join(" · ") : "No sizes recorded"}</Detail></div>
            </div>
            <div data-testid="garment-production-artwork" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) minmax(240px, 1fr)", gap: "22px", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
              <div style={{ minHeight: "340px", display: "grid", placeItems: "center", background: "#f8fafc", border: "2px solid #94a3b8", borderRadius: "18px", overflow: "hidden" }}>
                {artwork && artworkUrl && isArtworkImage(artwork) ? (
                  <img src={artworkUrl} alt={getArtworkDisplayName(artwork)} style={{ width: "100%", height: "360px", objectFit: "contain", background: "#ffffff" }} />
                ) : (
                  <span style={{ padding: "20px", color: "#64748b", fontWeight: 700 }}>No artwork preview available</span>
                )}
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                <Detail label="Assigned Artwork">{artwork ? getArtworkDisplayName(artwork) : "No artwork assigned"}</Detail>
                <Detail label="Placement">{lineItem.placement || "Not specified"}</Detail>
                <Detail label="Decoration Method">{lineItem.decoration_type || order.decoration_type || "Not specified"}</Detail>
                {artworkUrl ? (
                  <a data-testid="garment-production-file" href={artworkUrl} target="_blank" rel="noreferrer" style={{ justifySelf: "start", background: "#0f172a", color: "#ffffff", borderRadius: "12px", padding: "13px 18px", textDecoration: "none", fontWeight: 900, fontSize: "16px" }}>
                    Open Production File
                  </a>
                ) : (
                  <span data-testid="garment-production-file" style={{ color: "#9a3412", fontWeight: 800 }}>Production file unavailable</span>
                )}
              </div>
            </div>
            {lineNotes && !urgentNote ? (
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
                <Detail label="Production-specific Notes">{lineNotes}</Detail>
              </div>
            ) : null}
          </article>
        );
      }) : (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "16px", padding: "16px", color: "#9a3412", fontWeight: 800 }}>
          No garment line items are available for production.
        </div>
      )}
    </section>
  );
}
