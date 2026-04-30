import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStoredOrder } from "../lib/ordersStore";
import { getStoredProducts } from "../lib/productsStore";
import { getStoredCustomers, linkOrderToCustomer } from "../lib/customersStore";

const fallbackSizeKeys = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

function buildSizeState(sizeKeys) {
  return sizeKeys.reduce((sizes, size) => {
    sizes[size] = "";
    return sizes;
  }, {});
}

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
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    customer_company: "",
    product_id: "",
    garment: "",
    garment_category: "",
    brand_model: "",
    garment_color: "",
    placement: "",
    decoration_type: "",
    due_date: "",
    notes: "",
    source: "Walk-in",
  });
  const [sizes, setSizes] = useState(buildSizeState(fallbackSizeKeys));

  useEffect(() => {
    setProducts(getStoredProducts().filter((product) => product.status !== "Inactive"));
    setCustomers(getStoredCustomers());
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);

  const sizeKeys = selectedProduct?.sizes?.length ? selectedProduct.sizes : fallbackSizeKeys;
  const colorOptions = selectedProduct?.colors?.length ? selectedProduct.colors : [];
  const placementOptions = selectedProduct?.placements?.length ? selectedProduct.placements : [];
  const decorationOptions = selectedProduct?.decoration_types?.length
    ? selectedProduct.decoration_types
    : [];

  const totalQty = useMemo(() => {
    return Object.values(sizes).reduce((total, value) => {
      const qty = Number(value);
      return total + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, [sizes]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    if (name === "customer_name" || name === "customer_phone" || name === "customer_email") {
      setSelectedCustomerId("");
      setForm((current) => ({ ...current, customer_id: "", [name]: value }));
    }
  }

  function selectCustomer(event) {
    const customerId = event.target.value;
    setSelectedCustomerId(customerId);

    if (!customerId) {
      setForm((current) => ({
        ...current,
        customer_id: "",
      }));
      return;
    }

    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;

    setForm((current) => ({
      ...current,
      customer_id: customer.id,
      customer_name: customer.name || "",
      customer_phone: customer.phone || "",
      customer_email: customer.email || "",
      customer_company: customer.company || "",
      source: current.source === "Walk-in" ? "Repeat Order" : current.source,
    }));
  }

  function selectProduct(event) {
    const productId = event.target.value;
    const product = products.find((item) => item.id === productId);
    setSelectedProductId(productId);

    if (!product) {
      setForm((current) => ({
        ...current,
        product_id: "",
        garment: "",
        garment_category: "",
        brand_model: "",
        garment_color: "",
        placement: "",
        decoration_type: "",
      }));
      setSizes(buildSizeState(fallbackSizeKeys));
      return;
    }

    setForm((current) => ({
      ...current,
      product_id: product.id,
      garment: product.name,
      garment_category: product.category,
      brand_model: product.brand_model || "",
      garment_color: product.colors?.[0] || "",
      placement: product.placements?.[0] || "",
      decoration_type: product.decoration_types?.[0] || "",
    }));
    setSizes(buildSizeState(product.sizes?.length ? product.sizes : fallbackSizeKeys));
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
      product_image: selectedProduct?.image || "",
      product_notes: selectedProduct?.notes || "",
      qty: totalQty,
      size_breakdown: normalizedSizes,
    });

    if (form.customer_id) {
      linkOrderToCustomer(form.customer_id, order.order_number);
    }

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
          <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Staff Order Entry
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>New Order</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Select an existing customer or enter a new one, then choose a catalog garment for production.
          </p>
        </div>

        <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "20px" }}>Customer</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            <label style={labelStyle}>
              Existing Customer
              <select value={selectedCustomerId} onChange={selectCustomer} style={fieldStyle}>
                <option value="">New customer / type manually...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.company ? ` - ${customer.company}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Customer Name
              <input name="customer_name" value={form.customer_name} onChange={updateField} required placeholder="ABC Construction" style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Phone
              <input name="customer_phone" value={form.customer_phone} onChange={updateField} placeholder="(555) 123-4567" style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Email
              <input name="customer_email" value={form.customer_email} onChange={updateField} placeholder="customer@example.com" style={fieldStyle} />
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
          {selectedCustomerId && (
            <p style={{ margin: "12px 0 0", color: "#166534", fontWeight: 700 }}>
              This order will be linked to the selected customer profile.
            </p>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(220px, 320px)", gap: "18px", alignItems: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <label style={labelStyle}>
              Garment / Product
              <select value={selectedProductId} onChange={selectProduct} required style={fieldStyle}>
                <option value="">Select a catalog product...</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.brand_model ? ` (${product.brand_model})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Garment Color
              {colorOptions.length ? (
                <select name="garment_color" value={form.garment_color} onChange={updateField} style={fieldStyle}>
                  {colorOptions.map((color) => <option key={color}>{color}</option>)}
                </select>
              ) : (
                <input name="garment_color" value={form.garment_color} onChange={updateField} placeholder="Black" style={fieldStyle} />
              )}
            </label>

            <label style={labelStyle}>
              Decoration Type
              {decorationOptions.length ? (
                <select name="decoration_type" value={form.decoration_type} onChange={updateField} style={fieldStyle}>
                  {decorationOptions.map((method) => <option key={method}>{method}</option>)}
                </select>
              ) : (
                <input name="decoration_type" value={form.decoration_type} onChange={updateField} placeholder="Embroidery" style={fieldStyle} />
              )}
            </label>

            <label style={labelStyle}>
              Logo Placement
              {placementOptions.length ? (
                <select name="placement" value={form.placement} onChange={updateField} style={fieldStyle}>
                  {placementOptions.map((placement) => <option key={placement}>{placement}</option>)}
                </select>
              ) : (
                <input name="placement" value={form.placement} onChange={updateField} placeholder="Left Chest" style={fieldStyle} />
              )}
            </label>
          </div>

          <div style={{ border: "1px solid #e2e8f0", borderRadius: "18px", padding: "14px", background: "#f8fafc" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 700 }}>Garment Preview</p>
            <div style={{ height: "210px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: "#94a3b8", textAlign: "center", padding: "10px" }}>
              {selectedProduct?.image ? (
                <img src={selectedProduct.image} alt={selectedProduct.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                "Select a product with an image to preview it here"
              )}
            </div>
            {selectedProduct && (
              <div style={{ marginTop: "10px", color: "#475569", fontSize: "14px" }}>
                <strong>{selectedProduct.name}</strong>
                {selectedProduct.brand_model ? ` • ${selectedProduct.brand_model}` : ""}
                {selectedProduct.notes && <p style={{ marginBottom: 0 }}>{selectedProduct.notes}</p>}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: "24px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "20px" }}>Size Breakdown</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>Size fields now come from the selected catalog product.</p>
            </div>
            <strong style={{ fontSize: "18px" }}>Total: {totalQty}</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: "10px" }}>
            {sizeKeys.map((size) => (
              <label key={size} style={{ ...labelStyle, gap: "6px" }}>
                {size}
                <input type="number" min="0" inputMode="numeric" value={sizes[size] || ""} onChange={(event) => updateSize(size, event.target.value)} placeholder="0" style={{ ...fieldStyle, textAlign: "center" }} />
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginTop: "20px" }}>
          <label style={labelStyle}>
            Needed By
            <input type="date" name="due_date" value={form.due_date} onChange={updateField} style={fieldStyle} />
          </label>

          <label style={labelStyle}>
            Notes
            <textarea name="notes" value={form.notes} onChange={updateField} placeholder="Artwork notes, customer deadline, reorder details, etc." style={{ ...fieldStyle, minHeight: "96px", resize: "vertical" }} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => navigate("/admin/orders")} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "13px 18px", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
          <button type="submit" disabled={!form.customer_name || !form.garment || totalQty <= 0} style={{ background: totalQty > 0 && form.customer_name && form.garment ? "#171717" : "#a8a29e", color: "#ffffff", border: "none", borderRadius: "12px", padding: "13px 18px", cursor: totalQty > 0 && form.customer_name && form.garment ? "pointer" : "not-allowed", fontWeight: 700 }}>
            Save Order
          </button>
        </div>
      </form>
    </div>
  );
}
