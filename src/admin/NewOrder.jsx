import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStoredOrder } from "../lib/ordersStore";

const sizeKeys = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

const initialSizes = sizeKeys.reduce((sizes, size) => {
  sizes[size] = "";
  return sizes;
}, {});

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

export default function NewOrder() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    garment: "",
    garment_color: "",
    placement: "Left Chest",
    decoration_type: "Embroidery",
    due_date: "",
    notes: "",
    source: "Walk-in",
  });
  const [sizes, setSizes] = useState(initialSizes);

  const totalQty = useMemo(() => {
    return Object.values(sizes).reduce((total, value) => {
      const qty = Number(value);
      return total + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, [sizes]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateSize(size, value) {
    setSizes((current) => ({ ...current, [size]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const normalizedSizes = Object.fromEntries(
      Object.entries(sizes).map(([size, value]) => [size, Number(value) || 0])
    );

    const order = createStoredOrder({
      ...form,
      qty: totalQty,
      size_breakdown: normalizedSizes,
    });

    navigate(`/admin/orders/${order.order_number}`);
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
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ marginBottom: "22px" }}>
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
            Staff Order Entry
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>New Order</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Enter walk-in, phone, email, and repeat customer orders into one shared workflow.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <label style={labelStyle}>
            Customer Name
            <input
              name="customer_name"
              value={form.customer_name}
              onChange={updateField}
              required
              placeholder="ABC Construction"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Phone
            <input
              name="customer_phone"
              value={form.customer_phone}
              onChange={updateField}
              placeholder="(555) 123-4567"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Email
            <input
              name="customer_email"
              value={form.customer_email}
              onChange={updateField}
              placeholder="customer@example.com"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Order Source
            <select name="source" value={form.source} onChange={updateField} style={fieldStyle}>
              <option>Walk-in</option>
              <option>Phone</option>
              <option>Email</option>
              <option>Website</option>
              <option>Repeat Order</option>
            </select>
          </label>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <label style={labelStyle}>
            Garment / Item
            <input
              name="garment"
              value={form.garment}
              onChange={updateField}
              required
              placeholder="Gildan hoodie, Richardson hat, tee, etc."
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Garment Color
            <input
              name="garment_color"
              value={form.garment_color}
              onChange={updateField}
              placeholder="Black"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Decoration Type
            <select
              name="decoration_type"
              value={form.decoration_type}
              onChange={updateField}
              style={fieldStyle}
            >
              <option>Embroidery</option>
              <option>Screen Print</option>
              <option>Heat Press</option>
              <option>DTF Transfer</option>
              <option>Other</option>
            </select>
          </label>

          <label style={labelStyle}>
            Logo Placement
            <select name="placement" value={form.placement} onChange={updateField} style={fieldStyle}>
              <option>Left Chest</option>
              <option>Right Chest</option>
              <option>Front Center</option>
              <option>Back Center</option>
              <option>Sleeve</option>
              <option>Hat Front Panel</option>
              <option>Other</option>
            </select>
          </label>
        </div>

        <div
          style={{
            marginTop: "24px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "18px",
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
              <h2 style={{ margin: 0, fontSize: "20px" }}>Size Breakdown</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                Enter quantities by size. Total quantity updates automatically.
              </p>
            </div>
            <strong style={{ fontSize: "18px" }}>Total: {totalQty}</strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
              gap: "10px",
            }}
          >
            {sizeKeys.map((size) => (
              <label key={size} style={{ ...labelStyle, gap: "6px" }}>
                {size}
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={sizes[size]}
                  onChange={(event) => updateSize(size, event.target.value)}
                  placeholder="0"
                  style={{ ...fieldStyle, textAlign: "center" }}
                />
              </label>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginTop: "20px",
          }}
        >
          <label style={labelStyle}>
            Needed By
            <input
              type="date"
              name="due_date"
              value={form.due_date}
              onChange={updateField}
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={updateField}
              placeholder="Artwork notes, customer deadline, reorder details, etc."
              style={{ ...fieldStyle, minHeight: "96px", resize: "vertical" }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "24px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => navigate("/admin/orders")}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.customer_name || !form.garment || totalQty <= 0}
            style={{
              background: totalQty > 0 && form.customer_name && form.garment ? "#171717" : "#a8a29e",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: totalQty > 0 && form.customer_name && form.garment ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            Save Order
          </button>
        </div>
      </form>
    </div>
  );
}
