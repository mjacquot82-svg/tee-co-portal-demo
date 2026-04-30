import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";

const statusOptions = [
  "Awaiting Artwork",
  "Mockup Sent",
  "Approved",
  "In Production",
  "Ready for Pickup",
  "Completed",
  "On Hold",
  "Cancelled",
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("Awaiting Artwork");
  const [approvalNote, setApprovalNote] = useState("");

  useEffect(() => {
    const stored = findStoredOrder(orderNumber);
    if (stored) {
      setOrder(stored);
      setStatus(stored.status || "Awaiting Artwork");
      setApprovalNote(stored.approval_note || "");
    }
  }, [orderNumber]);

  function saveOrderUpdates(updates) {
    const updated = updateStoredOrder(orderNumber, updates);
    if (updated) {
      setOrder(updated);
      setStatus(updated.status || "Awaiting Artwork");
      setApprovalNote(updated.approval_note || "");
    }
  }

  function handleStatusChange(event) {
    saveOrderUpdates({ status: event.target.value });
  }

  function markApprovalSent() {
    saveOrderUpdates({
      status: "Mockup Sent",
      approval_status: "Mockup Sent",
      approval_note: approvalNote,
      approval_sent_at: new Date().toISOString(),
    });
  }

  function markApproved() {
    saveOrderUpdates({
      status: "Approved",
      approval_status: "Approved",
      approval_note: approvalNote,
      approved_at: new Date().toISOString(),
    });
  }

  function requestRevision() {
    saveOrderUpdates({
      status: "Awaiting Artwork",
      approval_status: "Revision Requested",
      approval_note: approvalNote,
      revision_requested_at: new Date().toISOString(),
    });
  }

  async function handleArtworkUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !order) return;

    const dataUrl = await readFileAsDataUrl(file);
    const nextArtwork = [
      ...(order.artwork_files || []),
      {
        id: `artwork-${Date.now()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: dataUrl,
        uploaded_at: new Date().toISOString(),
      },
    ];

    saveOrderUpdates({ artwork_files: nextArtwork });
    event.target.value = "";
  }

  const artworkFiles = order?.artwork_files || [];
  const approvalStatus = order?.approval_status || "Not Sent";

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
          marginBottom: "18px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Order {orderNumber}</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Job details, workflow status, artwork files, approval tracking, and printable production information.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          style={{
            background: "#171717",
            color: "#ffffff",
            border: "none",
            borderRadius: "12px",
            padding: "12px 16px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Print Work Order
        </button>
      </div>

      <div
        style={{
          marginBottom: "20px",
          display: "grid",
          gap: "8px",
          maxWidth: "280px",
        }}
      >
        <label style={{ fontWeight: 600 }}>Order Status</label>
        <select
          value={status}
          onChange={handleStatusChange}
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "12px",
            fontSize: "15px",
          }}
        >
          {statusOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>

      {order ? (
        <div style={{ display: "grid", gap: "18px" }}>
          <section
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Production Details</h2>
            <p><strong>Customer:</strong> {order.customer_name}</p>
            <p><strong>Garment:</strong> {order.garment}</p>
            <p><strong>Color:</strong> {order.garment_color || "—"}</p>
            <p><strong>Placement:</strong> {order.placement}</p>
            <p><strong>Decoration:</strong> {order.decoration_type}</p>
            <p><strong>Qty:</strong> {order.qty}</p>
            {order.due_date && <p><strong>Needed By:</strong> {order.due_date}</p>}
            {order.notes && <p><strong>Notes:</strong> {order.notes}</p>}
          </section>

          <section
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Mockup Approval</h2>
            <p style={{ color: "#64748b" }}>
              Track whether a mockup has been sent, approved, or sent back for revision.
            </p>
            <p><strong>Approval Status:</strong> {approvalStatus}</p>
            {order.approval_sent_at && <p><strong>Sent:</strong> {new Date(order.approval_sent_at).toLocaleString()}</p>}
            {order.approved_at && <p><strong>Approved:</strong> {new Date(order.approved_at).toLocaleString()}</p>}
            {order.revision_requested_at && <p><strong>Revision Requested:</strong> {new Date(order.revision_requested_at).toLocaleString()}</p>}

            <label style={{ display: "grid", gap: "8px", fontWeight: 600 }}>
              Approval / Revision Notes
              <textarea
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="Example: customer approved left chest logo, requested larger back logo, etc."
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "12px",
                  minHeight: "88px",
                  resize: "vertical",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              <button type="button" onClick={markApprovalSent} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Mark Mockup Sent
              </button>
              <button type="button" onClick={markApproved} style={{ border: "none", background: "#166534", color: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Mark Approved
              </button>
              <button type="button" onClick={requestRevision} style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Request Revision
              </button>
            </div>
          </section>

          <section
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Artwork Files</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  Attach logos, mockups, placement references, and revision versions to this job.
                </p>
              </div>
              <label
                style={{
                  background: "#171717",
                  color: "#ffffff",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Upload Artwork
                <input type="file" accept="image/*,.pdf" onChange={handleArtworkUpload} style={{ display: "none" }} />
              </label>
            </div>

            {artworkFiles.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
              <p style={{ color: "#94a3b8" }}>No artwork has been attached to this job yet.</p>
            )}
          </section>
        </div>
      ) : (
        <p style={{ color: "#94a3b8" }}>Order not found.</p>
      )}
    </div>
  );
}
