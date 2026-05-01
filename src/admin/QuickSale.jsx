import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getStoredProducts } from "../lib/productsStore";
import { createStoredQuickSale } from "../lib/salesStore";
import { getStoredCustomers } from "../lib/customersStore";

const taxRate = 0.13;

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/\D/g, "");
}

function isTypingField(element) {
  if (!element) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

function findCustomerMatches(customers, value) {
  const query = normalize(value);
  const phoneQuery = normalizePhone(value);

  if (query.length < 2 && phoneQuery.length < 3) return [];

  return customers
    .filter((customer) => {
      const searchableText = [customer.name, customer.company, customer.email, customer.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const customerPhone = normalizePhone(customer.phone);

      return (
        searchableText.includes(query) ||
        (phoneQuery.length >= 3 && customerPhone.includes(phoneQuery))
      );
    })
    .slice(0, 5);
}

export default function QuickSale() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completedSaleNumber = searchParams.get("completed");
  const productSelectRef = useRef(null);

  const [products] = useState(() =>
    getStoredProducts().filter((product) => product.status !== "Inactive")
  );
  const [customers] = useState(() => getStoredCustomers());
  const [customerMatches, setCustomerMatches] = useState([]);
  const [linkedCustomerId, setLinkedCustomerId] = useState("");
  const [linkedCustomerName, setLinkedCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [lineItem, setLineItem] = useState({
    name: "",
    color: "",
    size: "",
    qty: "1",
    unit_price: "",
  });
  const [cart, setCart] = useState([]);

  useEffect(() => {
    if (!completedSaleNumber) {
      productSelectRef.current?.focus();
    }
  }, [completedSaleNumber]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);

  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.qty * item.unit_price, 0);
  }, [cart]);

  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;
  const canAddItem = lineItem.name.trim() && Number(lineItem.qty) > 0;
  const canCompleteSale = cart.length > 0;

  useEffect(() => {
    function handleGlobalEnter(event) {
      if (completedSaleNumber || event.key !== "Enter" || !canCompleteSale) return;
      if (isTypingField(document.activeElement)) return;

      event.preventDefault();
      saveSale();
    }

    window.addEventListener("keydown", handleGlobalEnter);
    return () => window.removeEventListener("keydown", handleGlobalEnter);
  }, [completedSaleNumber, canCompleteSale, cart, customerName, linkedCustomerId, paymentMethod, subtotal, taxTotal, total, notes]);

  function updateCustomerName(value) {
    setCustomerName(value);
    setLinkedCustomerId("");
    setLinkedCustomerName("");
    setCustomerMatches(findCustomerMatches(customers, value));
  }

  function selectCustomer(customer) {
    setCustomerName(customer.name || "");
    setLinkedCustomerId(customer.id || "");
    setLinkedCustomerName(customer.name || "");
    setCustomerMatches([]);
  }

  function selectProduct(event) {
    const productId = event.target.value;
    const product = products.find((item) => item.id === productId);
    setSelectedProductId(productId);

    if (!product) {
      setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
      return;
    }

    setLineItem((current) => ({
      ...current,
      name: product.name || "",
      color: product.colors?.[0] || "",
      size: product.sizes?.[0] || "",
      unit_price: product.retail_price || product.price || "",
    }));
  }

  function updateLineItem(event) {
    const { name, value } = event.target;
    setLineItem((current) => ({ ...current, [name]: value }));
  }

  function handleLineItemKeyDown(event) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (canAddItem) {
      addToCart();
    }
  }

  function addToCart() {
    const qty = Number(lineItem.qty) || 0;
    const unitPrice = Number(lineItem.unit_price) || 0;

    if (!lineItem.name.trim() || qty <= 0 || unitPrice < 0) return;

    const item = {
      id: `cart-item-${Date.now()}`,
      product_id: selectedProductId,
      name: lineItem.name.trim(),
      color: lineItem.color.trim(),
      size: lineItem.size.trim(),
      qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    };

    setCart((current) => [...current, item]);
    setSelectedProductId("");
    setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
    setTimeout(() => productSelectRef.current?.focus(), 0);
  }

  function removeCartItem(itemId) {
    setCart((current) => current.filter((item) => item.id !== itemId));
  }

  function saveSale() {
    if (!cart.length) return;

    const sale = createStoredQuickSale({
      customer_id: linkedCustomerId,
      customer_name: customerName.trim() || "Walk-in Customer",
      payment_method: paymentMethod,
      payment_status: paymentMethod === "Pay Later" ? "Unpaid" : "Paid",
      amount_paid: paymentMethod === "Pay Later" ? 0 : total,
      balance_due: paymentMethod === "Pay Later" ? total : 0,
      items: cart,
      subtotal,
      tax_rate: taxRate,
      tax_total: taxTotal,
      total,
      notes,
    });

    navigate(`/admin/sales/new?completed=${sale.sale_number}`);
  }

  function completeSale(event) {
    event.preventDefault();
    saveSale();
  }

  if (completedSaleNumber) {
    return (
      <div
        style={{
          maxWidth: "720px",
          margin: "60px auto",
          padding: "32px",
          background: "#ffffff",
          borderRadius: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
          textAlign: "center",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#16a34a",
          }}
        >
          Sale Completed
        </p>

        <h1 style={{ margin: "10px 0 12px", fontSize: "32px" }}>
          Sale #{completedSaleNumber}
        </h1>

        <p style={{ marginBottom: "28px", color: "#64748b", fontSize: "16px" }}>
          The transaction has been saved successfully.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate("/admin/sales/new")}
            style={{
              background: "#171717",
              color: "#ffffff",
              border: "none",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Start Another Sale
          </button>

          <button
            onClick={() => navigate("/admin/sales")}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            View Sales History
          </button>

          <button
            onClick={() => navigate("/admin")}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Return to Dashboard
          </button>
        </div>
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
      <form
        onSubmit={completeSale}
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ marginBottom: "22px" }}>
          <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Counter Sale
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>Quick Sale</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Use this for walk-in purchases, stocked items, and payments taken at the counter. Customer name is optional.
          </p>
        </div>

        <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "20px" }}>Sale Details</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <label style={{ ...labelStyle, position: "relative" }}>
              Customer Name <span style={{ color: "#78716c", fontWeight: 500 }}>(optional)</span>
              <input value={customerName} onChange={(event) => updateCustomerName(event.target.value)} placeholder="Walk-in Customer" style={fieldStyle} />

              {customerMatches.length > 0 && !linkedCustomerId && (
                <div
                  style={{
                    position: "absolute",
                    top: "78px",
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)",
                    overflow: "hidden",
                  }}
                >
                  {customerMatches.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "11px 12px",
                        background: "#ffffff",
                        border: "none",
                        borderBottom: "1px solid #f1f5f9",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#292524",
                      }}
                    >
                      <strong>{customer.name}</strong>
                      {customer.company ? ` — ${customer.company}` : ""}
                      <span style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "13px" }}>
                        {[customer.phone, customer.email].filter(Boolean).join(" • ") || "Saved customer"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label style={labelStyle}>
              Payment Method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={fieldStyle}>
                <option>Cash</option>
                <option>Debit</option>
                <option>Credit</option>
                <option>E-transfer</option>
                <option>Square Later</option>
                <option>Pay Later</option>
              </select>
            </label>
          </div>

          {linkedCustomerId ? (
            <p style={{ margin: "12px 0 0", color: "#166534", fontWeight: 700 }}>
              Linked to existing customer: {linkedCustomerName}
            </p>
          ) : (
            <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>
              Start typing a saved customer name, company, phone, or email to link this sale.
            </p>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "18px", alignItems: "start" }}>
          <section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "20px" }}>Add Item</h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              <label style={labelStyle}>
                Product
                <select ref={productSelectRef} value={selectedProductId} onChange={selectProduct} onKeyDown={handleLineItemKeyDown} style={fieldStyle}>
                  <option value="">Select product or type manually...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}{product.brand_model ? ` (${product.brand_model})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Item Name
                <input name="name" value={lineItem.name} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} placeholder="T-Shirt" style={fieldStyle} />
              </label>

              <label style={labelStyle}>
                Color
                {selectedProduct?.colors?.length ? (
                  <select name="color" value={lineItem.color} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} style={fieldStyle}>
                    {selectedProduct.colors.map((color) => <option key={color}>{color}</option>)}
                  </select>
                ) : (
                  <input name="color" value={lineItem.color} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} placeholder="Black" style={fieldStyle} />
                )}
              </label>

              <label style={labelStyle}>
                Size
                {selectedProduct?.sizes?.length ? (
                  <select name="size" value={lineItem.size} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} style={fieldStyle}>
                    {selectedProduct.sizes.map((size) => <option key={size}>{size}</option>)}
                  </select>
                ) : (
                  <input name="size" value={lineItem.size} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} placeholder="L" style={fieldStyle} />
                )}
              </label>

              <label style={labelStyle}>
                Qty
                <input type="number" min="1" name="qty" value={lineItem.qty} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} style={fieldStyle} />
              </label>

              <label style={labelStyle}>
                Unit Price
                <input type="number" min="0" step="0.01" name="unit_price" value={lineItem.unit_price} onChange={updateLineItem} onKeyDown={handleLineItemKeyDown} placeholder="24.99" style={fieldStyle} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                onClick={addToCart}
                disabled={!canAddItem}
                style={{
                  background: canAddItem ? "#171717" : "#a8a29e",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  padding: "13px 18px",
                  cursor: canAddItem ? "pointer" : "not-allowed",
                  fontWeight: 700,
                }}
              >
                Add to Cart
              </button>
            </div>
          </section>

          <aside style={{ border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px", background: "#ffffff", position: "sticky", top: "18px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "20px" }}>Cart</h2>

            {cart.length ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {cart.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #e7e5e4", borderRadius: "12px", padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <strong>{item.name}</strong>
                      <button type="button" onClick={() => removeCartItem(item.id)} style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontWeight: 700 }}>
                        Remove
                      </button>
                    </div>
                    <p style={{ margin: "4px 0", color: "#64748b", fontSize: "14px" }}>
                      {[item.color, item.size].filter(Boolean).join(" • ") || "No variant"}
                    </p>
                    <p style={{ margin: 0, color: "#292524" }}>
                      {item.qty} × {currency(item.unit_price)} = <strong>{currency(item.line_total)}</strong>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", marginTop: 0 }}>No items added yet.</p>
            )}

            <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "16px", paddingTop: "14px", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span>
                <strong>{currency(subtotal)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Tax (13%)</span>
                <strong>{currency(taxTotal)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "20px" }}>
                <span>Total</span>
                <strong>{currency(total)}</strong>
              </div>
            </div>
          </aside>
        </div>

        <label style={{ ...labelStyle, marginTop: "20px" }}>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional sale note, receipt note, or payment reference." style={{ ...fieldStyle, minHeight: "86px", resize: "vertical" }} />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => navigate("/admin")} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "13px 18px", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
          <button type="submit" disabled={!canCompleteSale} style={{ background: canCompleteSale ? "#171717" : "#a8a29e", color: "#ffffff", border: "none", borderRadius: "12px", padding: "13px 18px", cursor: canCompleteSale ? "pointer" : "not-allowed", fontWeight: 700 }}>
            Complete Sale
          </button>
        </div>
      </form>
    </div>
  );
}
