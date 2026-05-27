import { buildStaffAuditFields } from "./staffUsersStore";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { normalizeCustomerId } from "./customerIds";
import { validatePaymentAmount } from "./financialValidation";

const STORAGE_KEY = "teeCoQuickSales";

function buildPaymentValidationError(validation) {
  const error = new Error(validation.message || "Invalid payment amount.");
  error.code = validation.code || "INVALID_AMOUNT";
  return error;
}

export function getStoredQuickSales() {
  if (!hasBrowserStorage()) return [];
  return getJsonStorageItem(STORAGE_KEY, []).map((sale) => ({
    ...sale,
    customer_id: normalizeCustomerId(sale.customer_id),
  }));
}

export function saveStoredQuickSales(sales) {
  if (!hasBrowserStorage()) return;
  setJsonStorageItem(STORAGE_KEY, sales);
}

export function createStoredQuickSale(saleInput) {
  const currentSales = getStoredQuickSales();
  const createdAt = new Date().toISOString();
  const saleNumber = saleInput.sale_number || `SALE-${Date.now().toString().slice(-6)}`;
  const total = Number(saleInput.total) || 0;
  const parsedAmountPaid = Number(saleInput.amount_paid);
  const hasAmountPaidInput =
    saleInput.amount_paid !== undefined &&
    saleInput.amount_paid !== null &&
    saleInput.amount_paid !== "";
  const amountPaid = Number.isFinite(parsedAmountPaid) ? parsedAmountPaid : 0;
  const balanceDue = Number(saleInput.balance_due) || 0;
  const staffAudit = buildStaffAuditFields("created");

  if (hasAmountPaidInput && !Number.isFinite(parsedAmountPaid)) {
    throw buildPaymentValidationError({
      code: "INVALID_NUMBER",
      message: "Enter a valid payment amount.",
    });
  }

  if (amountPaid > 0) {
    const validation = validatePaymentAmount({
      amount: amountPaid,
      remainingBalance: total,
    });

    if (!validation.valid) {
      throw buildPaymentValidationError(validation);
    }
  } else if (amountPaid < 0) {
    throw buildPaymentValidationError({
      code: "INVALID_AMOUNT",
      message: "Payment amount must be greater than 0.",
    });
  }

  const sale = {
    id: `quick-sale-${Date.now()}`,
    sale_number: saleNumber,
    customer_id: normalizeCustomerId(saleInput.customer_id),
    customer_name: saleInput.customer_name || "Walk-in Customer",
    payment_method: saleInput.payment_method || "Not Recorded",
    payment_status: saleInput.payment_status || "Paid",
    payment_reference: saleInput.payment_reference || "",
    items: saleInput.items || [],
    subtotal: Number(saleInput.subtotal) || 0,
    discount_amount: Number(saleInput.discount_amount) || 0,
    tax_rate: Number(saleInput.tax_rate) || 0,
    tax_total: Number(saleInput.tax_total) || 0,
    total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
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

export function updateStoredQuickSale(saleNumber, updates) {
  const currentSales = getStoredQuickSales();
  let updatedSale = null;

  const nextSales = currentSales.map((sale) => {
    if (sale.sale_number !== saleNumber) return sale;

    updatedSale = {
      ...sale,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    return updatedSale;
  });

  saveStoredQuickSales(nextSales);
  return updatedSale;
}
