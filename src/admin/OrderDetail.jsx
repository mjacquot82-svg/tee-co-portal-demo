import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";
import { getStoredProducts } from "../lib/productsStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";

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

const paymentMethods = ["e-transfer", "cash", "card terminal", "cheque", "other"];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sizeRowsFromOrder(order) {
  if (Array.isArray(order?.size_breakdown) && order.size_breakdown.length) {
    return order.size_breakdown;
  }

  if (order?.size) {
    return [{ size: order.size, quantity: Number(order.qty || 0) }];
  }

  return [
    { size: "S", quantity: 0 },
    { size: "M", quantity: 0 },
    { size: "L", quantity: 0 },
    { size: "XL", quantity: 0 },
  ];
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("Awaiting Artwork");
  const [approvalNote, setApprovalNote] = useState("");
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const [depositType, setDepositType] = useState("percentage");
  const [depositValue, setDepositValue] = useState("50");
  const [paymentMethod, setPaymentMethod] = useState("e-transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [sizeRows, setSizeRows] = useState([]);

  useEffect(() => {
    const stored = findStoredOrder(orderNumber);
    if (stored) {
      setOrder(stored);
      setStatus(stored.status || "Awaiting Artwork");
      setApprovalNote(stored.approval_note || "");
      setDepositType(stored.deposit?.type || "percentage");
      setDepositValue(String(stored.deposit?.value ?? "50"));
      setPaymentMethod(stored.deposit?.method || "e-transfer");
      setPaymentNote(stored.deposit?.note || "");
      setSizeRows(sizeRowsFromOrder(stored));
    }
  }, [orderNumber]);

  const selectedProduct = useMemo(() => {
    if (!order) return null;
    return getStoredProducts().find(
      (product) => product.id === order.product_id || product.name === order.garment
    );
  }, [order]);

  const quoteSnapshot = useMemo(() => {
    if (!order) return null;
    return generateQuoteSnapshot(order, selectedProduct);
  }, [order, selectedProduct]);

  const sizeTotal = sizeRows.reduce((total, row) => total + Number(row.quantity || 0), 0);

  function saveOrderUpdates(updates) {
    const updated = updateStoredOrder(orderNumber, updates);
    if (updated) {
      setOrder(updated);
      setStatus(updated.status || "Awaiting Artwork");
      setApprovalNote(updated.approval_note || "");
      setDepositType(updated.deposit?.type || depositType);
      setDepositValue(String(updated.deposit?.value ?? depositValue));
      setPaymentMethod(updated.deposit?.method || paymentMethod);
      setPaymentNote(updated.deposit?.note || paymentNote);
    }
  }

  function calculateDepositAmount() {
    const total = Number((order?.quote || quoteSnapshot)?.total || 0);
    const value = Number(depositValue || 0);
    if (depositType === "fixed") return value;
    return (total * value) / 100;
  }

  function handleStatusChange(event) {
    saveOrderUpdates({ status: event.target.value });
  }

  function updateSizeRow(index, field, value) {
    setSizeRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: field === "quantity" ? Number(value || 0) : value,
            }
          : row
      )
    );
  }

  function addSizeRow() {
    setSizeRows((current) => [...current, { size: "", quantity: 0 }]);
  }

  function removeSizeRow(index) {
    setSizeRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function saveSizeBreakdown() {
    const cleanedRows = sizeRows
      .filter((row) => row.size || Number(row.quantity || 0) > 0)
      .map((row) => ({ size: row.size, quantity: Number(row.quantity || 0) }));

    const total = cleanedRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    saveOrderUpdates({
      size_breakdown: cleanedRows,
      qty: total,
    });
  }

  function saveQuoteSnapshot() {
    if (!quoteSnapshot) return;
    saveOrderUpdates({ quote: quoteSnapshot });
    setShowQuotePreview(true);
  }

  function applyDepositRule() {
    const amount = calculateDepositAmount();
    saveOrderUpdates({
      deposit: {
        ...(order?.deposit || {}),
        required: true,
        type: depositType,
        value: Number(depositValue || 0),
        amount,
        status: order?.deposit?.status || "pending",
        method: order?.deposit?.method || paymentMethod,
        note: order?.deposit?.note || paymentNote,
        provider: "manual",
      },
      production_ready: order?.deposit?.status === "paid",
    });
  }

  function clearDepositRequirement() {
    saveOrderUpdates({
      deposit: {
        required: false,
        type: "none",
        value: 0,
        amount: 0,
        status: "not required",
        method: "manual",
        note: "No deposit required for this order.",
        provider: "manual",
      },
      production_ready: order?.approval_status === "Approved",
    });
  }

  function markDepositReceived() {
    const amount = order?.deposit?.amount ?? calculateDepositAmount();
    saveOrderUpdates({
      deposit: {
        ...(order?.deposit || {}),
        required: true,
        type: depositType,
        value: Number(depositValue || 0),
        amount,
        status: "paid",
        method: paymentMethod,
        note: paymentNote,
        provider: "manual",
        received_at: new Date().toISOString(),
      },
      production_ready: true,
    });
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
  const activeQuote = order?.quote || quoteSnapshot;
  const depositAmount = calculateDepositAmount();

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
            Job details, quote preview, deposits, size breakdowns, artwork files, and approval tracking.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveQuoteSnapshot}
            style={{
              background: "#ffffff",
              color: "#171717",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "12px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Preview Quote
          </button>
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
          {showQuotePreview && quoteSnapshot && (
            <section
              style={{
                background: "#ffffff",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Quote Preview</h2>
              <p style={{ color: "#64748b" }}>
                Pricing is generated from product placement pricing and the order quantity.
              </p>

              <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
                <span><strong>Customer:</strong> {quoteSnapshot.customer_name || "—"}</span>
                <span><strong>Garment:</strong> {quoteSnapshot.garment || "—"}</span>
                <span><strong>Quantity:</strong> {quoteSnapshot.quantity}</span>
              </div>

              {quoteSnapshot.placement_lines.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "10px 8px" }}>Placement</th>
                      <th style={{ padding: "10px 8px" }}>Decoration</th>
                      <th style={{ padding: "10px 8px" }}>Unit</th>
                      <th style={{ padding: "10px 8px" }}>Qty</th>
                      <th style={{ padding: "10px 8px" }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteSnapshot.placement_lines.map((line, index) => (
                      <tr key={`${line.placement}-${index}`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "10px 8px" }}>{line.placement || "—"}</td>
                        <td style={{ padding: "10px 8px" }}>{line.decoration_type || "—"}</td>
                        <td style={{ padding: "10px 8px" }}>{money(line.unit_price)}</td>
                        <td style={{ padding: "10px 8px" }}>{line.quantity}</td>
                        <td style={{ padding: "10px 8px", fontWeight: 700 }}>{money(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#94a3b8" }}>No placement lines available for this quote yet.</p>
              )}

              <div style={{ display: "grid", justifyContent: "end", gap: "6px", fontSize: "16px" }}>
                <span><strong>Placement subtotal:</strong> {money(quoteSnapshot.placement_subtotal)}</span>
                <span><strong>Setup fees:</strong> {money(quoteSnapshot.setup_subtotal)}</span>
                <span style={{ fontSize: "20px" }}><strong>Total:</strong> {money(quoteSnapshot.total)}</span>
              </div>
            </section>
          )}

          <section
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Size Breakdown</h2>
            <p style={{ color: "#64748b" }}>
              Track size splits for garments and product variants. The total updates the order quantity.
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              {sizeRows.map((row, index) => (
                <div key={`${row.size}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: "10px", alignItems: "center" }}>
                  <input
                    value={row.size}
                    onChange={(event) => updateSizeRow(index, "size", event.target.value)}
                    placeholder="Size / Variant"
                    style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}
                  />
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(event) => updateSizeRow(index, "quantity", event.target.value)}
                    placeholder="Qty"
                    style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}
                  />
                  <button type="button" onClick={() => removeSizeRow(index)} style={{ border: "1px solid #fecaca", color: "#991b1b", background: "#fff", borderRadius: "10px", padding: "9px 10px", cursor: "pointer", fontWeight: 700 }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "14px" }}>
              <button type="button" onClick={addSizeRow} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Add Size / Variant
              </button>
              <button type="button" onClick={saveSizeBreakdown} style={{ border: "none", background: "#171717", color: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Save Size Breakdown
              </button>
              <strong>Total Qty: {sizeTotal}</strong>
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
            <h2 style={{ marginTop: 0 }}>Deposit / Payment Tracking</h2>
            <p style={{ color: "#64748b" }}>
              Manual payment tracking now; Stripe payment links can be added later as a premium upgrade.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px", fontWeight: 600 }}>
                Deposit Type
                <select value={depositType} onChange={(event) => setDepositType(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: "6px", fontWeight: 600 }}>
                Deposit Value
                <input type="number" value={depositValue} onChange={(event) => setDepositValue(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }} />
              </label>

              <label style={{ display: "grid", gap: "6px", fontWeight: 600 }}>
                Payment Method
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}>
                  {paymentMethods.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "6px", fontWeight: 600, marginTop: "12px" }}>
              Payment Notes
              <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Example: e-transfer received from customer email." style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px", minHeight: "76px" }} />
            </label>

            <div style={{ marginTop: "14px", display: "grid", gap: "6px" }}>
              <span><strong>Quote Total:</strong> {money(activeQuote?.total)}</span>
              <span><strong>Calculated Deposit:</strong> {money(order.deposit?.amount ?? depositAmount)}</span>
              <span><strong>Deposit Status:</strong> {order.deposit?.status || "not set"}</span>
              <span><strong>Production Ready:</strong> {order.production_ready ? "Yes" : "No"}</span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              <button type="button" onClick={applyDepositRule} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Apply Deposit Rule
              </button>
              <button type="button" onClick={markDepositReceived} style={{ border: "none", background: "#166534", color: "#ffffff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Mark Deposit Received
              </button>
              <button type="button" onClick={clearDepositRequirement} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                No Deposit Required
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
