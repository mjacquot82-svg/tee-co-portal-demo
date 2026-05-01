const STORAGE_KEY = "teeCoQuickSales";
import { buildStaffAuditFields } from "./staffUsersStore";

export function getStoredQuickSales() {
  if (typeof window === "undefined") return [];

  try {
    const rawSales = window.localStorage.getItem(STORAGE_KEY);
    return rawSales ? JSON.parse(rawSales) : [];
  } catch (error) {
    console.error("Unable to read Tee & Co quick sales", error);
    return [];
  }
}

export function saveStoredQuickSales(sales) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
}

export function createStoredQuickSale(saleInput) {
  const currentSales = getStoredQuickSales();
  const createdAt = new Date().toISOString();
  const saleNumber = saleInput.sale_number || `SALE-${Date.now().toString().slice(-6)}`;

  const staffAudit = buildStaffAuditFields("created");

  const sale = {
    id: `quick-sale-${Date.now()}`,
    sale_number: saleNumber,
    customer_id: saleInput.customer_id || "",
    customer_name: saleInput.customer_name || "Walk-in Customer",
    payment_method: saleInput.payment_method || "Not Recorded",
    payment_status: saleInput.payment_status || "Paid",
    payment_reference: saleInput.payment_reference || "",
    items: saleInput.items || [],
    subtotal: Number(saleInput.subtotal) || 0,
    discount_amount: Number(saleInput.discount_amount) || 0,
    tax_rate: Number(saleInput.tax_rate) || 0,
    tax_total: Number(saleInput.tax_total) || 0,
    total: Number(saleInput.total) || 0,
    amount_paid: Number(saleInput.amount_paid) || 0,
    balance_due: Number(saleInput.balance_due) || 0,
    notes: saleInput.notes || "",
    square_payment_id: saleInput.square_payment_id || "",
    production_order_numbers: saleInput.production_order_numbers || [],
    ...staffAudit,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const nextSales = [sale, ...currentSales];
  saveStoredQuickSales(nextSales);
  return sale;
}

export function findStoredQuickSale(saleNumber) {
  return getStoredQuickSales().find((sale) => sale.sale_number === saleNumber);
}
