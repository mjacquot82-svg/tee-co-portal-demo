import { useParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";
import { getStoredProducts } from "../lib/productsStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import StatusBadge from "../components/StatusBadge";

const workflowActions = [
  {
    label: "Send Quote / Mockup",
    status: "Mockup Sent",
    approval_status: "Mockup Sent",
    timestamp: "approval_sent_at",
    note: "Moves this order into Quotes / Approval.",
  },
  {
    label: "Mark Approved",
    status: "Approved",
    approval_status: "Approved",
    timestamp: "approved_at",
    note: "Customer approved the order or mockup.",
  },
  {
    label: "Request Deposit",
    status: "Awaiting Deposit",
    deposit_status: "pending",
    note: "Order is approved but should wait for payment before production.",
  },
  {
    label: "Record Deposit Paid",
    status: "Approved",
    deposit_status: "paid",
    production_ready: true,
    timestamp: "deposit_received_at",
    note: "Marks the job ready for the production queue.",
  },
  {
    label: "Start Production",
    status: "In Production",
    production_ready: true,
    timestamp: "production_started_at",
    note: "Moves this job into active shop work.",
  },
  {
    label: "Ready for Pickup",
    status: "Ready for Pickup",
    timestamp: "ready_for_pickup_at",
    note: "Finished and waiting for customer pickup or delivery.",
  },
  {
    label: "Complete Order",
    status: "Completed",
    timestamp: "completed_at",
    note: "Order is fully closed out.",
  },
];

const statusOptions = [
  "Awaiting Artwork",
  "Mockup Sent",
  "Awaiting Approval",
  "Approved",
  "Awaiting Deposit",
  "In Production",
  "Printing",
  "Embroidery",
  "Ready for Pickup",
  "Completed",
  "On Hold",
  "Cancelled",
];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getSizeRows(order) {
  if (Array.isArray(order?.size_breakdown)) {
    return order.size_breakdown.map((row) => ({
      size: row.size || row[0] || "",
      quantity: Number(row.quantity ?? row.qty ?? row[1] ?? 0),
    }));
  }

  if (order?.size_breakdown && typeof order.size_breakdown === "object") {
    return Object.entries(order.size_breakdown).map(([size, quantity]) => ({
      size,
      quantity: Number(quantity || 0),
    }));
  }

  return order?.size ? [{ size: order.size, quantity: Number(order.qty || 0) }] : [];
}

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
  const [sizeRows, setSizeRows] = useState([]);
  const [depositValue, setDepositValue] = useState("50");
  const [depositType, setDepositType] = useState("percentage");
  const [paymentMethod, setPaymentMethod] = useState("e-transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [showQuotePreview, setShowQuotePreview] = useState(false);

  useEffect(() => {
    const stored = findStoredOrder(orderNumber);
    if (stored) {
      setOrder(stored);
      setStatus(stored.status || "Awaiting Artwork");
      setApprovalNote(stored.approval_note || "");
      setSizeRows(getSizeRows(stored));
      setDepositType(stored.deposit?.type || "percentage");
      setDepositValue(String(stored.deposit?.value ?? "50"));
      setPaymentMethod(stored.deposit?.method || "e-transfer");
      setPaymentNote(stored.deposit?.note || "");
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

  const activeQuote = order?.quote || quoteSnapshot;
  const artworkFiles = order?.artwork_files || [];
  const sizeTotal = sizeRows.reduce((total, row) => total + Number(row.quantity || 0), 0);

  function saveOrderUpdates(updates) {
    const updated = updateStoredOrder(orderNumber, updates);
    if (!updated) return;

    setOrder(updated);
    setStatus(updated.status || "Awaiting Artwork");
    setApprovalNote(updated.approval_note || "");
    setSizeRows(getSizeRows(updated));
  }

  function calculateDepositAmount() {
    const total = Number(activeQuote?.total || 0);
    const value = Number(depositValue || 0);
    return depositType === "fixed" ? value : (total * value) / 100;
  }

  function applyWorkflowAction(action) {
    const now = new Date().toISOString();
    const updates = {
      status: action.status,
      workflow_note: action.note,
    };

    if (action.approval_status) updates.approval_status = action.approval_status;
    if (action.timestamp) updates[action.timestamp] = now;
    if (typeof action.production_ready === "boolean") updates.production_ready = action.production_ready;

    if (action.deposit_status) {
      updates.deposit = {
        ...(order?.deposit || {}),
        required: true,
        type: depositType,
        value: Number(depositValue || 0),
        amount: calculateDepositAmount(),
        status: action.deposit_status,
        method: paymentMethod,
        note: paymentNote,
        provider: "manual",
        updated_at: now,
      };
    }

    saveOrderUpdates(updates);
  }

  function handleStatusChange(event) {
    saveOrderUpdates({ status: event.target.value });
  }

  function saveQuoteSnapshot() {
    if (!quoteSnapshot) return;
    saveOrderUpdates({ quote: quoteSnapshot });
    setShowQuotePreview(true);
  }

  function saveSizeBreakdown() {
    const cleanedRows = sizeRows
      .filter((row) => row.size || Number(row.quantity || 0) > 0)
      .map((row) => ({ size: row.size, quantity: Number(row.quantity || 0) }));

    const qty = cleanedRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    saveOrderUpdates({ size_breakdown: cleanedRows, qty });
  }

  function updateSizeRow(index, field, value) {
    setSizeRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, [field]: field === "quantity" ? Number(value || 0) : value }
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

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Order not found</h1>
        <Link to="/admin/orders">Back to Production Orders</Link>
      </div>
    );
  }

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
      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", marginBottom: "18px" }}>
        <div>
          <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Production Order
          </p>
          <h1 style={{ margin: "6px 0 8px" }}>Order {orderNumber}</h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge status={order.status} />
            <span style={{ color: "#64748b" }}>{order.customer_name || "Walk-in Customer"}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "start" }}>
          <Link to="/admin/orders" style={{ border: "1px solid #cbd5e1", color: "#171717", background: "#ffffff", borderRadius: "12px", padding: "12px 16px", textDecoration: "none", fontWeight: 700 }}>
            Production Orders
          </Link>
          <button type="button" onClick={() => window.print()} style={{ background: "#171717", color: "#ffffff", border: "none", borderRadius: "12px", padding: "12px 16px", cursor: "pointer", fontWeight: 700 }}>
            Print Work Order
          </button>
        </div>
      </div>

      <section style={{ background: "#ffffff", borderRadius: "20px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "18px" }}>
        <h2 style={{ marginTop: 0 }}>Workflow Actions</h2>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Use these buttons to move the order through quote, approval, deposit, production, and pickup.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          {workflowActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => applyWorkflowAction(action)}
              style={{
                border: "1px solid #d6d3d1",
                background: action.production_ready ? "#ecfdf5" : "#ffffff",
                color: action.production_ready ? "#166534" : "#171717",
                borderRadius: "14px",
                padding: "12px",
                cursor: "pointer",
                textAlign: "left",
                fontWeight: 800,
              }}
            >
              {action.label}
              <span style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "4px", fontWeight: 600 }}>
                {action.note}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Manual Status
            <select value={status} onChange={handleStatusChange} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}>
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Deposit Type
            <select value={depositType} onChange={(event) => setDepositType(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Deposit Value
            <input type="number" value={depositValue} onChange={(event) => setDepositValue(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }} />
          </label>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Payment Method
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }}>
              <option>e-transfer</option>
              <option>cash</option>
              <option>card terminal</option>
              <option>cheque</option>
              <option>other</option>
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: "6px", fontWeight: 700, marginTop: "12px" }}>
          Workflow / Payment Note
          <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Example: deposit received by e-transfer, customer approved mockup by phone, etc." style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px", minHeight: "72px" }} />
        </label>

        <div style={{ marginTop: "14px", display: "grid", gap: "5px", color: "#475569" }}>
          <span><strong>Deposit Status:</strong> {order.deposit?.status || "not set"}</span>
          <span><strong>Deposit Amount:</strong> {money(order.deposit?.amount ?? calculateDepositAmount())}</span>
          <span><strong>Production Ready:</strong> {order.production_ready ? "Yes" : "No"}</span>
          {order.workflow_note && <span><strong>Last Workflow Note:</strong> {order.workflow_note}</span>}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)", gap: "18px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "18px" }}>
          <section style={{ background: "#ffffff", borderRadius: "20px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>Quote Snapshot</h2>
                <p style={{ color: "#64748b", margin: "4px 0 0" }}>Pricing generated from product placement pricing and order quantity.</p>
              </div>
              <button type="button" onClick={saveQuoteSnapshot} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
                Save / Preview Quote
              </button>
            </div>

            {(showQuotePreview || order.quote) && activeQuote ? (
              <div style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
                <span><strong>Quantity:</strong> {activeQuote.quantity || order.qty || 0}</span>
                <span><strong>Placement subtotal:</strong> {money(activeQuote.placement_subtotal)}</span>
                <span><strong>Setup fees:</strong> {money(activeQuote.setup_subtotal)}</span>
                <span style={{ fontSize: "20px" }}><strong>Total:</strong> {money(activeQuote.total)}</span>
              </div>
            ) : (
              <p style={{ color: "#94a3b8" }}>Save a quote snapshot to lock in the current quote total.</p>
            )}
          </section>

          <section style={{ background: "#ffffff", borderRadius: "20px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>Size Breakdown</h2>
            <div style={{ display: "grid", gap: "10px" }}>
              {sizeRows.length ? sizeRows.map((row, index) => (
                <div key={`${row.size}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: "10px", alignItems: "center" }}>
                  <input value={row.size} onChange={(event) => updateSizeRow(index, "size", event.target.value)} placeholder="Size / Variant" style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }} />
                  <input type="number" value={row.quantity} onChange={(event) => updateSizeRow(index, "quantity", event.target.value)} placeholder="Qty" style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px" }} />
                  <button type="button" onClick={() => removeSizeRow(index)} style={{ border: "1px solid #fecaca", color: "#991b1b", background: "#fff", borderRadius: "10px", padding: "9px 10px", cursor: "pointer", fontWeight: 700 }}>Remove</button>
                </div>
              )) : <p style={{ color: "#94a3b8" }}>No size breakdown saved yet.</p>}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "14px" }}>
              <button type="button" onClick={addSizeRow} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>Add Size</button>
              <button type="button" onClick={saveSizeBreakdown} style={{ border: "none", background: "#171717", color: "#fff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>Save Sizes</button>
              <strong>Total Qty: {sizeTotal}</strong>
            </div>
          </section>

          <section style={{ background: "#ffffff", borderRadius: "20px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>Artwork Files</h2>
            <label style={{ display: "inline-block", background: "#171717", color: "#ffffff", borderRadius: "12px", padding: "12px 16px", cursor: "pointer", fontWeight: 700, marginBottom: "14px" }}>
              Upload Artwork
              <input type="file" accept="image/*,.pdf" onChange={handleArtworkUpload} style={{ display: "none" }} />
            </label>
            {artworkFiles.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
                {artworkFiles.map((file) => (
                  <article key={file.id} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", padding: "12px", background: "#f8fafc" }}>
                    <div style={{ height: "140px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: "#64748b", marginBottom: "10px" }}>
                      {file.type?.startsWith("image/") ? <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "File attached"}
                    </div>
                    <strong style={{ display: "block", fontSize: "14px" }}>{file.name}</strong>
                    <span style={{ color: "#64748b", fontSize: "12px" }}>{Math.round((file.size || 0) / 1024)} KB</span>
                  </article>
                ))}
              </div>
            ) : <p style={{ color: "#94a3b8" }}>No artwork attached yet.</p>}
          </section>
        </div>

        <aside style={{ display: "grid", gap: "18px" }}>
          <section style={{ background: "#ffffff", borderRadius: "20px", padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>Production Details</h2>
            <p><strong>Customer:</strong> {order.customer_name || "—"}</p>
            <p><strong>Garment:</strong> {order.garment || "—"}</p>
            <p><strong>Color:</strong> {order.garment_color || "—"}</p>
            <p><strong>Placement:</strong> {order.placement || "—"}</p>
            <p><strong>Decoration:</strong> {order.decoration_type || "—"}</p>
            <p><strong>Qty:</strong> {order.qty || 0}</p>
            {order.due_date && <p><strong>Needed By:</strong> {order.due_date}</p>}
            {order.notes && <p><strong>Notes:</strong> {order.notes}</p>}
          </section>

          <section style={{ background: "#ffffff", borderRadius: "20px", padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>Approval Notes</h2>
            <p><strong>Status:</strong> {order.approval_status || "Not Sent"}</p>
            <textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Approval or revision notes" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px", minHeight: "90px" }} />
            <button type="button" onClick={() => saveOrderUpdates({ approval_note: approvalNote })} style={{ marginTop: "10px", border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "12px", padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>
              Save Approval Note
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
