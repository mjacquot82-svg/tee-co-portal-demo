const money = (value) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value) || 0);

export function validateDiscountInput({ type, value }, subtotal) {
  const amount = Number(value);
  if (!["percent", "fixed"].includes(type)) return "Choose percent or fixed amount.";
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a discount greater than 0.";
  if (type === "percent" && amount > 100) return "A percent discount can't be more than 100%.";
  if (type === "fixed" && Number(subtotal) > 0 && amount > Number(subtotal)) {
    return `A fixed discount can't be more than the subtotal (${money(subtotal)}).`;
  }
  return "";
}
