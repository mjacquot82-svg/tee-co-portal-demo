// Updated QuickSale.jsx with customer auto-match support
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

  const productSelectRef = useRef(null);

  const [products] = useState(() =>
    getStoredProducts().filter((product) => product.status !== "Inactive")
  );

  const [customers] = useState(() => getStoredCustomers());
  const [customerMatches, setCustomerMatches] = useState([]);
  const [linkedCustomerId, setLinkedCustomerId] = useState(null);

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

  function updateCustomerName(value) {
    setCustomerName(value);
    setLinkedCustomerId(null);

    if (!value.trim()) {
      setCustomerMatches([]);
      return;
    }

    const matches = customers
      .filter((customer) =>
        customer.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 5);

    setCustomerMatches(matches);
  }

  function selectCustomer(customer) {
    setCustomerName(customer.name);
    setLinkedCustomerId(customer.id);
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

    setLineItem({
      name: product.name,
      color: product.colors?.[0] || "",
      size: product.sizes?.[0] || "",
      qty: "1",
      unit_price: product.retail_price || product.price || "",
    });
  }

  function updateLineItem(event) {
    const { name, value } = event.target;
    setLineItem((current) => ({ ...current, [name]: value }));
  }

  function addToCart() {
    const qty = Number(lineItem.qty) || 0;
    const unitPrice = Number(lineItem.unit_price) || 0;

    if (!lineItem.name.trim() || qty <= 0) return;

    setCart((current) => [
      ...current,
      {
        id: `cart-${Date.now()}`,
        ...lineItem,
        qty,
        unit_price: unitPrice,
        line_total: qty * unitPrice,
      },
    ]);

    setSelectedProductId("");

    setLineItem({
      name: "",
      color: "",
      size: "",
      qty: "1",
      unit_price: "",
    });

    productSelectRef.current?.focus();
  }

  function removeCartItem(id) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  function saveSale() {
    if (!cart.length) return;

    const sale = createStoredQuickSale({
      customer_name: customerName.trim() || "Walk-in Customer",
      customer_id: linkedCustomerId,
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
      <div style={{ padding: "60px", textAlign: "center" }}>
        <h1>Sale #{completedSaleNumber}</h1>
        <button onClick={() => navigate("/admin/sales/new")}>Start Another Sale</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px" }}>
      <h1>Quick Sale</h1>

      <label style={labelStyle}>
        Customer Name
        <input
          value={customerName}
          onChange={(e) => updateCustomerName(e.target.value)}
          placeholder="Walk‑in Customer"
          style={fieldStyle}
        />

        {customerMatches.length > 0 && (
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "white",
              marginTop: "4px",
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
                  textAlign: "left",
                  padding: "10px",
                  border: "none",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <strong>{customer.name}</strong>
                {customer.company ? ` — ${customer.company}` : ""}
              </button>
            ))}
          </div>
        )}
      </label>

      <br />

      <button onClick={saveSale}>Complete Sale</button>
    </div>
  );
}
