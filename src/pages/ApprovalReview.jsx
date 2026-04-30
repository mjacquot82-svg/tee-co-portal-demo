import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";

export default function ApprovalReview() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [customerNote, setCustomerNote] = useState("");

  useEffect(() => {
    const stored = findStoredOrder(orderNumber);
    if (stored) {
      setOrder(stored);
      setCustomerNote(stored.customer_approval_note || "");
    }
  }, [orderNumber]);

  function approveMockup() {
    const updated = updateStoredOrder(orderNumber, {
      status: "Approved",
      approval_status: "Customer Approved",
      customer_approval_note: customerNote,
      customer_approved_at: new Date().toISOString(),
    });
    if (updated) setOrder(updated);
  }

  function requestChanges() {
    const updated = updateStoredOrder(orderNumber, {
      status: "Awaiting Artwork",
      approval_status: "Customer Requested Changes",
      customer_approval_note: customerNote,
      customer_revision_requested_at: new Date().toISOString(),
    });
    if (updated) setOrder(updated);
  }

  if (!order) {
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px" }}>
        <h1>Approval Review</h1>
        <p style={{ color: "#64748b" }}>
          This approval record was not found on this device yet. In production, this page will load from cloud storage.
        </p>
      </div>
    );
  }

  const artworkFiles = order.artwork_files || [];

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "28px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "22px",
          padding: "26px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#78716c",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Customer Approval
        </p>
        <h1 style={{ margin: "6px 0 8px" }}>Review Mockup for Order {order.order_number}</h1>
        <p style={{ color: "#64748b" }}>
          Review the attached artwork/mockup and either approve it for production or request changes.
        </p>

        <div style={{ display: "grid", gap: "6px", marginTop: "18px" }}>
          <span><strong>Customer:</strong> {order.customer_name}</span>
          <span><strong>Garment:</strong> {order.garment}</span>
          <span><strong>Placement:</strong> {order.placement}</span>
          <span><strong>Decoration:</strong> {order.decoration_type}</span>
          <span><strong>Status:</strong> {order.approval_status || order.status}</span>
        </div>

        <h2 style={{ marginTop: "24px" }}>Artwork / Mockup Files</h2>
        {artworkFiles.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "14px",
            }}
          >
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
                    height: "170px",
                    borderRadius: "12px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    marginBottom: "10px",
                    color: "#64748b",
                  }}
                >
                  {file.type?.startsWith("image/") ? (
                    <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    "File attached"
                  )}
                </div>
                <strong style={{ fontSize: "14px" }}>{file.name}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>No artwork files are attached yet.</p>
        )}

        <label style={{ display: "grid", gap: "8px", fontWeight: 600, marginTop: "22px" }}>
          Approval Notes
          <textarea
            value={customerNote}
            onChange={(event) => setCustomerNote(event.target.value)}
            placeholder="Add approval comments or requested changes here."
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "12px",
              minHeight: "100px",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "18px" }}>
          <button
            type="button"
            onClick={approveMockup}
            style={{
              background: "#166534",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Approve for Production
          </button>
          <button
            type="button"
            onClick={requestChanges}
            style={{
              background: "#fff7ed",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Request Changes
          </button>
        </div>
      </div>
    </div>
  );
}
