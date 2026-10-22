import { useState } from "react";
import { applyOrderDiscount, normalizeOrderDiscount } from "../orders/orderFinancials";
import { validateDiscountInput } from "../orders/discountValidation";

const money = (value) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value) || 0);


// Staff/owner control to apply or remove an order discount before a deposit or invoice is sent.
// Persists discount_type / discount_value / discount_reason; totals, tax, deposit and balance are
// recalculated by normalizeOrderFinancials. The database only accepts these fields from staff.
export default function OrderDiscountEditor({ order, financials, onSave, disabled = false, lockedReason = "" }) {
  const current = normalizeOrderDiscount(order || {});
  const hasDiscount = Boolean(current.type) && current.value > 0;
  const subtotal = Number(financials?.subtotal ?? 0);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(current.type || "percent");
  const [value, setValue] = useState(hasDiscount ? String(current.value) : "");
  const [reason, setReason] = useState(current.reason || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const preview = applyOrderDiscount(subtotal, { type, value: Number(value), reason });

  async function save(next) {
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      setOpen(false);
    } catch (saveError) {
      setError(saveError?.message || "Unable to save the discount.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApply(event) {
    event.preventDefault();
    const problem = validateDiscountInput({ type, value }, subtotal);
    if (problem) {
      setError(problem);
      return;
    }
    await save({ discount_type: type, discount_value: Number(value), discount_reason: reason.trim() });
  }

  const box = { padding: "10px 12px", borderRadius: "10px", border: "1px solid #dbeafe", background: "#eff6ff" };
  const btn = { padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700, cursor: "pointer" };
  const primaryBtn = { ...btn, background: "#171717", color: "#fff", borderColor: "#171717" };
  const input = { padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", width: "100%" };

  return (
    <div data-testid="order-discount-editor" style={{ display: "grid", gap: "8px" }}>
      {hasDiscount ? (
        <div data-testid="order-discount-summary" style={box}>
          <strong>Discount applied: {money(financials?.discount_amount)}</strong>
          <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
            {current.type === "percent" ? `${current.value}%` : "Fixed amount"}
            {current.reason ? ` · ${current.reason}` : ""}
          </p>
        </div>
      ) : null}
      {disabled ? (
        lockedReason ? <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{lockedReason}</p> : null
      ) : !open ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={() => { setType(current.type || "percent"); setValue(hasDiscount ? String(current.value) : ""); setReason(current.reason || ""); setError(""); setOpen(true); }} data-testid="order-discount-open">
            {hasDiscount ? "Change discount" : "Apply discount"}
          </button>
          {hasDiscount ? (
            <button
              type="button"
              data-testid="order-discount-remove"
              style={btn}
              disabled={saving}
              onClick={() => save({ discount_type: "", discount_value: 0, discount_reason: "" })}
            >
              Remove discount
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleApply} style={{ ...box, display: "grid", gap: "8px" }} aria-label="Apply discount">
          <label style={{ display: "grid", gap: "4px", fontSize: "13px" }}>
            Discount type
            <select value={type} onChange={(e) => setType(e.target.value)} style={input} aria-label="Discount type">
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed amount ($)</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "4px", fontSize: "13px" }}>
            {type === "percent" ? "Percent off" : "Amount off (before tax)"}
            <input
              aria-label="Discount value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              style={input}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", fontSize: "13px" }}>
            Reason (optional, staff only)
            <input aria-label="Discount reason" value={reason} onChange={(e) => setReason(e.target.value)} style={input} />
          </label>
          {Number(value) > 0 && subtotal > 0 ? (
            <p data-testid="order-discount-preview" style={{ margin: 0, fontSize: "13px" }}>
              {money(preview.discount_amount)} off · new subtotal {money(preview.discounted_subtotal)} (tax recalculated)
            </p>
          ) : null}
          {error ? <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "13px" }}>{error}</p> : null}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" style={primaryBtn} disabled={saving} data-testid="order-discount-apply">Save discount</button>
            <button type="button" style={btn} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
