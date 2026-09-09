import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDefaultDecorationType } from "../lib/orderConfiguration";
import { getProductPlacementConfig, useStoredProducts } from "../lib/productsStore";
import { generateOrderQuoteSnapshot } from "../lib/quoteEngine";
import { getLineItemQuantity } from "../lib/orderLineItems";
import { ensureOrdersHydrated } from "../lib/ordersStore";
import { createStaffOrder } from "../services/staffOrderService";
import "./NewOrder.css";

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = { display: "grid", gap: "8px", fontWeight: 700, color: "#292524" };

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function optionValue(value) {
  return typeof value === "string" ? value : value?.name || value?.label || "";
}

function makeLineItem(product) {
  const decoration = getDefaultDecorationType(product);
  const placement = getProductPlacementConfig(product)[0]?.label || "";
  const firstSize = optionValue(product?.sizes?.[0]);
  return {
    id: crypto.randomUUID(),
    product_id: product?.id || "",
    selected_color: optionValue(product?.colors?.[0]),
    decoration_type: decoration,
    placement,
    size_breakdown: firstSize ? { [firstSize]: 1 } : {},
    production_notes: "",
  };
}

function Section({ title, description, children }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "20px", padding: "20px", display: "grid", gap: "16px" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "20px" }}>{title}</h2>
        {description ? <p style={{ margin: "6px 0 0", color: "#64748b", lineHeight: 1.5 }}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LineItemEditor({ item, index, products, onChange, onRemove, removable }) {
  const product = products.find((entry) => entry.id === item.product_id) || null;
  const placements = getProductPlacementConfig(product);
  const decorations = product?.decoration_types?.length
    ? product.decoration_types
    : product?.production_methods || [];

  function changeProduct(productId) {
    const nextProduct = products.find((entry) => entry.id === productId);
    onChange(makeLineItem(nextProduct));
  }

  function updateSize(size, value) {
    onChange({
      ...item,
      size_breakdown: { ...item.size_breakdown, [size]: value },
    });
  }

  return (
    <article data-testid="staff-order-line-item" style={{ border: "1px solid #dbe4ee", borderRadius: "16px", padding: "16px", display: "grid", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <strong>Item {index + 1}</strong>
        {removable ? <button type="button" onClick={onRemove}>Remove</button> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px" }}>
        <label style={labelStyle}>
          Product
          <select value={item.product_id} onChange={(event) => changeProduct(event.target.value)} style={fieldStyle} required>
            {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Color
          <select value={item.selected_color} onChange={(event) => onChange({ ...item, selected_color: event.target.value })} style={fieldStyle}>
            {(product?.colors || []).map((color) => { const value = optionValue(color); return <option key={value} value={value}>{value}</option>; })}
          </select>
        </label>
        <label style={labelStyle}>
          Decoration
          <select value={item.decoration_type} onChange={(event) => onChange({ ...item, decoration_type: event.target.value })} style={fieldStyle} required>
            {decorations.map((decoration) => { const value = optionValue(decoration); return <option key={value} value={value}>{value}</option>; })}
          </select>
        </label>
        <label style={labelStyle}>
          Placement
          <select value={item.placement} onChange={(event) => onChange({ ...item, placement: event.target.value })} style={fieldStyle}>
            <option value="">No placement</option>
            {placements.map((placement) => <option key={placement.id || placement.label} value={placement.label}>{placement.label}</option>)}
          </select>
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 800, marginBottom: "10px" }}>Size quantities</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: "10px" }}>
          {(product?.sizes || []).map((sizeOption) => {
            const size = optionValue(sizeOption);
            return (
              <label key={size} style={{ ...labelStyle, fontSize: "13px" }}>
                {size}
                <input type="number" min="0" step="1" inputMode="numeric" value={item.size_breakdown?.[size] ?? ""} onChange={(event) => updateSize(size, event.target.value)} style={fieldStyle} />
              </label>
            );
          })}
        </div>
      </fieldset>
      <label style={labelStyle}>
        Item customization / production notes
        <textarea rows="2" value={item.production_notes} onChange={(event) => onChange({ ...item, production_notes: event.target.value })} style={fieldStyle} />
      </label>
      <strong style={{ color: "#475569" }}>{getLineItemQuantity(item)} pieces</strong>
    </article>
  );
}

export default function StaffCreateOrder() {
  const navigate = useNavigate();
  const submissionRef = useRef(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const products = useStoredProducts().filter((product) => String(product.status || "").toLowerCase() !== "inactive");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", company: "" });
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState(() => products.length ? [makeLineItem(products[0])] : []);
  const [submitState, setSubmitState] = useState("idle");
  const [message, setMessage] = useState("");

  const configuredItems = useMemo(() => lineItems.map((item) => {
    const product = products.find((entry) => entry.id === item.product_id);
    const placement = item.placement;
    return {
      ...item,
      garment: product?.name || "",
      placements: placement ? [{ placement, decoration_type: item.decoration_type }] : [],
      quantity: getLineItemQuantity(item),
    };
  }), [lineItems, products]);
  const quote = useMemo(
    () => configuredItems.length ? generateOrderQuoteSnapshot({ line_items: configuredItems }, products) : null,
    [configuredItems, products]
  );

  function persistEffectiveItems(nextItems) {
    setLineItems(nextItems);
  }

  function updateItem(index, item) {
    const next = [...lineItems];
    next[index] = item;
    persistEffectiveItems(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submissionRef.current) return submissionRef.current;
    setSubmitState("submitting");
    setMessage("");
    const operation = (async () => {
      try {
        const result = await createStaffOrder({
          idempotency_key: idempotencyKeyRef.current,
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_email: customer.email,
          customer_company: customer.company,
          due_date: dueDate,
          notes,
          line_items: configuredItems,
        });
        await ensureOrdersHydrated({ force: true });
        setSubmitState("success");
        setMessage(`${result.order.order_number} created successfully.`);
        navigate(`/admin/orders/${result.order.order_number}`, {
          replace: true,
          state: { flashMessage: `${result.order.order_number} created in Staff Portal. Payment is unpaid.`, flashTone: "success" },
        });
      } catch (error) {
        setSubmitState("error");
        setMessage(error instanceof Error ? error.message : "The order could not be created.");
      } finally {
        submissionRef.current = null;
      }
    })();
    submissionRef.current = operation;
    return operation;
  }

  return (
    <main className="new-order-page" style={{ maxWidth: "1080px", margin: "0 auto" }}>
      <form onSubmit={handleSubmit} className="new-order-form" noValidate style={{ display: "grid", gap: "18px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Staff Portal</p>
            <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>Create Order</h1>
            <p style={{ margin: 0, color: "#475569" }}>Enter the customer and catalog items, review authoritative pricing, then create a normal production order.</p>
          </div>
          <Link to="/admin">Back to Staff Home</Link>
        </header>

        <Section title="1 · Customer information" description="Use the same required identity fields as existing Tee & Co order intake. Email and company are optional.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            <label style={labelStyle}>Full name<input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} style={fieldStyle} autoComplete="name" required /></label>
            <label style={labelStyle}>Phone<input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} style={fieldStyle} inputMode="tel" autoComplete="tel" required /></label>
            <label style={labelStyle}>Email<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} style={fieldStyle} autoComplete="email" /></label>
            <label style={labelStyle}>Company<input value={customer.company} onChange={(event) => setCustomer({ ...customer, company: event.target.value })} style={fieldStyle} autoComplete="organization" /></label>
          </div>
        </Section>

        <Section title="2 · Products and customization" description="Products, sizes, colors, decoration methods, placements, and prices come from the current catalog.">
          {!products.length ? <div role="alert">No active catalog products are available. Refresh the page or contact an owner.</div> : null}
          {lineItems.map((item, index) => (
            <LineItemEditor key={item.id} item={item} index={index} products={products} onChange={(next) => updateItem(index, next)} onRemove={() => persistEffectiveItems(lineItems.filter((_, itemIndex) => itemIndex !== index))} removable={lineItems.length > 1} />
          ))}
          <button type="button" disabled={!products.length} onClick={() => persistEffectiveItems([...lineItems, makeLineItem(products[0])])} style={{ justifySelf: "start" }}>{lineItems.length ? "+ Add another item" : "+ Add item"}</button>
        </Section>

        <Section title="3 · Timing and notes">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 260px) 1fr", gap: "14px" }}>
            <label style={labelStyle}>Needed by<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} style={fieldStyle} /></label>
            <label style={labelStyle}>Order notes<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} style={fieldStyle} /></label>
          </div>
        </Section>

        <Section title="4 · Review order" description="The server reloads catalog records and recalculates these amounts before saving. Browser-submitted totals are ignored.">
          <div style={{ display: "grid", gap: "8px" }}>
            {configuredItems.map((item, index) => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span>{index + 1}. {item.garment} · {item.quantity} pieces</span><strong>{item.selected_color || "No color"}</strong></div>)}
          </div>
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", display: "grid", gap: "6px", maxWidth: "360px", marginLeft: "auto", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><strong>{quote?.subtotal === null ? "Unavailable" : money(quote?.subtotal)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tax (13%)</span><strong>{quote?.tax_amount === null ? "Unavailable" : money(quote?.tax_amount)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "18px" }}><span>Total</span><strong>{quote?.total_amount === null ? "Unavailable" : money(quote?.total_amount)}</strong></div>
          </div>
          <div style={{ borderRadius: "12px", background: "#fff7ed", border: "1px solid #fed7aa", padding: "12px 14px", color: "#9a3412", fontWeight: 700 }}>
            Payment will be recorded as unpaid. Collect or reconcile payment through the existing Front Counter / Square workflow after creating the order.
          </div>
          {message ? <div role="alert" style={{ borderRadius: "12px", padding: "12px 14px", background: submitState === "error" ? "#fef2f2" : "#ecfdf5", color: submitState === "error" ? "#991b1b" : "#166534" }}>{message}</div> : null}
          <button type="submit" disabled={submitState === "submitting" || !products.length || quote?.subtotal === null} style={{ border: 0, borderRadius: "12px", padding: "13px 18px", background: "#171717", color: "#fff", fontWeight: 800, justifySelf: "end" }}>
            {submitState === "submitting" ? "Creating Order…" : "Create Order"}
          </button>
        </Section>
      </form>
    </main>
  );
}
