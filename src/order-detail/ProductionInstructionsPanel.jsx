import { normalizeProductionType } from "../constants/productionTypes";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";

function formatPlacements(order) {
  if (Array.isArray(order.placements) && order.placements.length) {
    return order.placements
      .map((item) => item?.placement)
      .filter(Boolean)
      .join(", ");
  }

  return order.placement || "—";
}

const rowLabelStyle = {
  color: "#57534e",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const rowValueStyle = {
  color: "#171717",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: 1.32,
};

const fileLinkStyle = {
  color: "inherit",
  textDecoration: "none",
};

export default function ProductionInstructionsPanel({ order = {} }) {
  const productionType = normalizeProductionType(
    order.decoration_type ||
      order.production_type ||
      "Screen Printing"
  );
  const artworkFiles = getOrderArtworkFiles(order);

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "18px",
      }}
    >
      <div style={{ display: "grid", gap: "4px", marginBottom: "14px" }}>
        <span
          style={{
            color: "#78716c",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Production Instructions
        </span>
        <h2 style={{ margin: 0, fontSize: "22px", lineHeight: 1.1 }}>
          {order.order_number || "Unnumbered Order"}
        </h2>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Customer</span>
          <span style={rowValueStyle}>{order.customer_name || "Walk-in Customer"}</span>
        </div>

        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Garment</span>
          <span style={rowValueStyle}>{order.garment || order.item || "Custom garment"}</span>
        </div>

        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Placements</span>
          <span style={rowValueStyle}>{formatPlacements(order)}</span>
        </div>

        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Production Type</span>
          <span style={rowValueStyle}>{productionType}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={rowLabelStyle}>Quantity</span>
            <span style={rowValueStyle}>{order.qty || 0}</span>
          </div>

          <div style={{ display: "grid", gap: "2px" }}>
            <span style={rowLabelStyle}>Due Date</span>
            <span style={rowValueStyle}>{order.due_date || "—"}</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Production Notes</span>
          <span style={{ ...rowValueStyle, whiteSpace: "pre-wrap" }}>
            {order.production_notes || "—"}
          </span>
        </div>

        <div style={{ display: "grid", gap: "2px" }}>
          <span style={rowLabelStyle}>Internal Notes</span>
          <span style={{ ...rowValueStyle, whiteSpace: "pre-wrap" }}>
            {order.internal_note || "—"}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: "16px",
          paddingTop: "16px",
          borderTop: "1px solid #e2e8f0",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Artwork Files</span>
          <span style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
            Files the production team should pull for this job.
          </span>
        </div>

        {artworkFiles.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {artworkFiles.map((file, index) => {
              const assetUrl = getArtworkAssetUrl(file);
              const displayName = getArtworkDisplayName(file);
              const imageFile = isArtworkImage(file) && Boolean(assetUrl);
              const card = (
                <article
                  style={{
                    display: "grid",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    border: "1px solid #dbe2ea",
                    minHeight: "100%",
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      minHeight: "136px",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: imageFile ? 0 : "18px",
                    }}
                  >
                    {imageFile ? (
                      <img
                        src={assetUrl}
                        alt={displayName}
                        style={{
                          width: "100%",
                          height: "136px",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "14px",
                          background: "#e2e8f0",
                          color: "#475569",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "24px",
                          fontWeight: 800,
                        }}
                      >
                        {assetUrl ? "FILE" : "N/A"}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <strong
                      style={{
                        color: "#111827",
                        fontSize: "14px",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      {displayName}
                    </strong>

                    {(file.placement_hint || file.type || file.file_type) && (
                      <span style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.4 }}>
                        {[file.placement_hint, file.type || file.file_type]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    )}
                  </div>
                </article>
              );

              return assetUrl ? (
                <a
                  key={file.id || `${displayName}-${index}`}
                  href={assetUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={fileLinkStyle}
                  title={`Open ${displayName}`}
                >
                  {card}
                </a>
              ) : (
                <div key={file.id || `${displayName}-${index}`}>{card}</div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8" }}>
            No artwork files recorded for production yet.
          </p>
        )}
      </div>
    </section>
  );
}
