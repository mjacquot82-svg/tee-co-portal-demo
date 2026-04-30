import { Link, useParams } from "react-router-dom";
import { findStoredOrder } from "../lib/ordersStore";
import StatusBadge from "../components/StatusBadge";

function formatDate(value) {
  if (!value) return "—";
  return value;
}

function label(value) {
  return value || "—";
}

export default function WorkOrder() {
  const { orderNumber } = useParams();
  const order = findStoredOrder(orderNumber);

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Work Order Not Found</h1>
        <p>This production packet could not be loaded.</p>
        <Link to="/admin/queue">Back to Production Queue</Link>
      </div>
    );
  }

  const placements = Array.isArray(order.placements) && order.placements.length
    ? order.placements
    : [
        {
          placement: order.placement,
          decoration_type: order.decoration_type,
          artwork_name: order.customer_artwork_name,
        },
      ].filter((item) => item.placement || item.decoration_type || item.artwork_name);

  const artworkFiles = order.artwork_files || [];
  const quote = order.quote;

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Production Packet
          </p>
          <h1 style={{ margin: "6px 0 8px" }}>Work Order {order.order_number}</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Print-friendly production details for embroidery, screen print, DTF, patches, and other decoration methods.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to={`/admin/orders/${order.order_number}`}
            style={{
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Back to Order
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: "#171717",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Print Packet
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "18px" }}>
        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Job Summary</h2>
              <p><strong>Customer:</strong> {label(order.customer_name)}</p>
              <p><strong>Garment / Product:</strong> {label(order.garment)}</p>
              <p><strong>Color:</strong> {label(order.garment_color)}</p>
              <p><strong>Quantity:</strong> {label(order.qty)}</p>
              <p><strong>Due Date:</strong> {formatDate(order.due_date)}</p>
            </div>
            <div style={{ minWidth: "220px" }}>
              <p><strong>Status:</strong></p>
              <StatusBadge status={order.status || "Awaiting Artwork"} />
              <p style={{ marginTop: "16px" }}><strong>Production Ready:</strong> {order.production_ready ? "Yes" : "No"}</p>
              <p><strong>Deposit:</strong> {order.deposit?.status || "not set"}</p>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Decoration / Placement Details</h2>
          {placements.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 8px" }}>Placement</th>
                  <th style={{ padding: "10px 8px" }}>Decoration Method</th>
                  <th style={{ padding: "10px 8px" }}>Artwork / Logo</th>
                  <th style={{ padding: "10px 8px" }}>Production Notes</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((placement, index) => (
                  <tr key={`${placement.placement}-${index}`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "12px 8px" }}>{label(placement.placement)}</td>
                    <td style={{ padding: "12px 8px" }}>{label(placement.decoration_type || order.decoration_type)}</td>
                    <td style={{ padding: "12px 8px" }}>{label(placement.artwork_name || placement.customer_artwork_name)}</td>
                    <td style={{ padding: "12px 8px" }}>{label(placement.notes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#94a3b8" }}>No decoration placements have been added yet.</p>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Artwork / Reference Files</h2>
          {artworkFiles.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              {artworkFiles.map((file) => (
                <article
                  key={file.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "12px",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      height: "150px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      color: "#64748b",
                      marginBottom: "10px",
                    }}
                  >
                    {file.type?.startsWith("image/") ? (
                      <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      "File attached"
                    )}
                  </div>
                  <strong style={{ display: "block", fontSize: "14px" }}>{file.name}</strong>
                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {Math.round((file.size || 0) / 1024)} KB
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>No artwork/reference files attached.</p>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Production Notes / Checklist</h2>
          <p><strong>Customer Notes:</strong> {label(order.notes)}</p>
          <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
            <label><input type="checkbox" readOnly /> Product pulled / confirmed</label>
            <label><input type="checkbox" readOnly /> Artwork reviewed</label>
            <label><input type="checkbox" readOnly /> Placement confirmed</label>
            <label><input type="checkbox" readOnly /> Decoration method confirmed</label>
            <label><input type="checkbox" readOnly /> Quality check complete</label>
          </div>
        </section>

        {quote && (
          <section
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "22px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Quote Snapshot</h2>
            <p><strong>Total:</strong> ${Number(quote.total || 0).toFixed(2)}</p>
            <p><strong>Generated:</strong> {quote.generated_at ? new Date(quote.generated_at).toLocaleString() : "—"}</p>
          </section>
        )}
      </div>
    </div>
  );
}
