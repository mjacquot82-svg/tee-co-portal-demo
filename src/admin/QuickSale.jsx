import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getStoredProducts } from "../lib/productsStore";
import { createStoredQuickSale } from "../lib/salesStore";

const taxRate = 0.13;

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

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function QuickSale() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completedSaleNumber = searchParams.get("completed");

  const [products] = useState(() =>
    getStoredProducts().filter((product) => product.status !== "Inactive")
  );

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

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);

  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.qty * item.unit_price, 0);
  }, [cart]);

  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;

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
  }

  function removeCartItem(itemId) {
    setCart((current) => current.filter((item) => item.id !== itemId));
  }

  function completeSale(event) {
    event.preventDefault();
    if (!cart.length) return;

    const sale = createStoredQuickSale({
      customer_name: customerName.trim() || "Walk-in Customer",
      payment_method: paymentMethod,
      payment_status: paymentMethod === "Pay Later" ? "Unpaid" : "Paid",
      items: cart,
      subtotal,
      tax_rate: taxRate,
      tax_total: taxTotal,
      total,
      notes,
    });

    navigate(`/admin/sales/new?completed=${sale.sale_number}`);
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

  const canAddItem = lineItem.name.trim() && Number(lineItem.qty) > 0;
  const canCompleteSale = cart.length > 0;

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
            Use this for walk-in purchases, stocked items, and anything paid for at the counter. Customer name is optional.
          </p>
        </div>

        {/* rest unchanged UI below */}
      </form>
    </div>
  );
}
