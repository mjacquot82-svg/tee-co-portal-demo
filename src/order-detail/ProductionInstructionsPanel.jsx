import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getArtworkUsage,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";

const sectionStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "20px",
  padding: "18px",
};

const sectionDescriptionStyle = {
  margin: "4px 0 16px",
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.5,
};

export default function ProductionInstructionsPanel({ order = {}, showInternalNotes = true }) {
  const artworkFiles = getOrderArtworkFiles(order);
  const artworkUsage = getArtworkUsage(order);
  const artworkPreviews = artworkFiles.filter((file) => {
    const assetUrl = getArtworkAssetUrl(file);
    return isArtworkImage(file) && Boolean(assetUrl);
  });

  return (
    <>
      <section data-testid="production-artwork" style={sectionStyle}>
        <h2 style={{ margin: 0, fontSize: "22px" }}>Artwork</h2>
        <p style={sectionDescriptionStyle}>Visual reference for what should be produced.</p>

        {artworkUsage.length ? (
          <div style={{ display: "grid", gap: "8px", marginBottom: "14px" }}>
            {artworkUsage.map(({ artwork, lineItems }) => (
              <div key={artwork.id} style={{ padding: "10px 12px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #dbe2ea" }}>
                <strong>{getArtworkDisplayName(artwork)}</strong>
                <span style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "12px" }}>
                  Used by: {lineItems.map((item) => item.garment || item.item || "Custom garment").join(", ") || "No garments"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {artworkPreviews.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            {artworkPreviews.map((file, index) => {
              const assetUrl = getArtworkAssetUrl(file);
              const displayName = getArtworkDisplayName(file);

              return (
                <article
                  key={file.id || `${displayName}-${index}`}
                  style={{ display: "grid", gap: "10px", padding: "12px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #dbe2ea" }}
                >
                  <img
                    src={assetUrl}
                    alt={displayName}
                    style={{ width: "100%", height: "180px", objectFit: "contain", display: "block", background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0" }}
                  />
                  {(file.placement_hint || file.type || file.file_type) ? (
                    <span style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.4 }}>
                      {[file.placement_hint, file.type || file.file_type].filter(Boolean).join(" • ")}
                    </span>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8" }}>No artwork preview available for production yet.</p>
        )}
      </section>

      <section data-testid="production-notes" style={sectionStyle}>
        <h2 style={{ margin: 0, fontSize: "22px" }}>Production Notes</h2>
        <p style={{ margin: "10px 0 0", color: "#171717", fontSize: "14px", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {order.production_notes || "No production notes recorded."}
        </p>
        {showInternalNotes ? (
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>Internal Notes</h3>
            <p style={{ margin: "8px 0 0", color: "#171717", fontSize: "14px", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {order.internal_note || "No internal notes recorded."}
            </p>
          </div>
        ) : null}
      </section>

      <section data-testid="production-files" style={sectionStyle}>
        <h2 style={{ margin: 0, fontSize: "22px" }}>Production Files</h2>
        <p style={sectionDescriptionStyle}>Open the source files needed to produce this job.</p>

        {artworkFiles.length ? (
          <div style={{ display: "grid", gap: "8px" }}>
            {artworkFiles.map((file, index) => {
              const assetUrl = getArtworkAssetUrl(file);
              const displayName = getArtworkDisplayName(file);
              const content = (
                <span style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", padding: "12px 14px", borderRadius: "12px", border: "1px solid #dbe2ea", background: "#f8fafc", color: "#111827", fontWeight: 700 }}>
                  <span style={{ wordBreak: "break-word" }}>{displayName}</span>
                  <span style={{ color: "#475569", fontSize: "12px" }}>{assetUrl ? "Open file" : "Unavailable"}</span>
                </span>
              );

              return assetUrl ? (
                <a
                  key={file.id || `${displayName}-${index}`}
                  href={assetUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit", textDecoration: "none" }}
                  title={`Open ${displayName}`}
                >
                  {content}
                </a>
              ) : (
                <div key={file.id || `${displayName}-${index}`}>{content}</div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8" }}>No production files recorded yet.</p>
        )}
      </section>
    </>
  );
}
