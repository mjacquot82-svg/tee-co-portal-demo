import { deriveOrderPaymentState, deriveOrderWorkflowState } from "./canonicalState";
import { calculateInvoiceTax, DEFAULT_SALES_TAX_RATE } from "./salesTax";

export const PAYMENT_STATUS_OPTIONS = [
  "Draft",
  "Awaiting Payment",
  "Awaiting Deposit",
  "Deposit Applied",
  "Partial Payment",
  "Paid",
];

export const INVOICE_WORKFLOW_STATUS_OPTIONS = [
  "Draft",
  "Sent",
  "Partial Payment",
  "Paid",
  "Overdue",
  "Refunded",
  "Void",
];

export const PICKUP_STATUS_OPTIONS = [
  "Pending",
  "Ready for Pickup",
  "Picked Up",
];

export const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Debit",
  "Credit",
  "E-Transfer",
  "Cheque",
  "Square Terminal",
  "Other",
];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

const SUBTOTAL_KEYS = ["subtotal", "sub_total", "subtotal_amount", "subtotalAmount"];
const TAX_KEYS = [
  "tax_amount",
  "tax_total",
  "tax",
  "taxAmount",
  "taxTotal",
  "total_tax",
  "totalTax",
  "sales_tax",
  "salesTax",
];
const TOTAL_KEYS = [
  "total_amount",
  "total",
  "order_total",
  "grand_total",
  "grandTotal",
  "final_total",
  "finalTotal",
  "total_price",
  "totalPrice",
  "amount_total",
  "amountTotal",
];
const ORDER_FINANCIAL_WARNING_CACHE = new Set();

function parseCurrency(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");

    if (!normalized) return null;

    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  return null;
}

function normalizeCurrency(value) {
  const amount = parseCurrency(value);

  if (amount === null) return 0;

  return Math.round(amount * 100) / 100;
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizePaymentMethod(method) {
  return PAYMENT_METHOD_OPTIONS.includes(method) ? method : "Other";
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeInvoiceWorkflowStatus(status) {
  const normalized = normalizeLower(status);

  if (!normalized) return "";
  if (normalized.includes("void")) return "Void";
  if (normalized.includes("refund")) return "Refunded";
  if (normalized.includes("overdue") || normalized.includes("past due")) return "Overdue";
  if (normalized.includes("partial")) return "Partial Payment";
  if (normalized.includes("paid")) return "Paid";
  if (normalized.includes("sent")) return "Sent";
  if (normalized.includes("draft")) return "Draft";

  return "";
}

function resolveCurrency(...values) {
  for (const value of values) {
    const amount = parseCurrency(value);

    if (amount !== null) {
      return normalizeCurrency(amount);
    }
  }

  return null;
}

function sumCurrencies(...values) {
  let total = 0;
  let hasValue = false;

  values.forEach((value) => {
    const amount = parseCurrency(value);

    if (amount !== null) {
      total += amount;
      hasValue = true;
    }
  });

  return hasValue ? normalizeCurrency(total) : null;
}

function resolveCurrencyFromKeys(source, keys) {
  return resolveCurrency(...keys.map((key) => source?.[key]));
}

function sumLineAmounts(lines, amountKey) {
  if (!Array.isArray(lines) || !lines.length) {
    return null;
  }

  return sumCurrencies(...lines.map((line) => line?.[amountKey]));
}

function buildFinancialSources(order = {}, options = {}) {
  const explicitSources = [];
  const addSource = (value, label) => {
    if (!value || typeof value !== "object") return;
    explicitSources.push({ value, label });
  };

  (options.additionalSources || []).forEach((entry, index) => {
    if (entry && typeof entry === "object" && "value" in entry) {
      addSource(entry.value, entry.label || `additionalSources[${index}]`);
      return;
    }

    addSource(entry, `additionalSources[${index}]`);
  });

  addSource(order, "order");
  addSource(order.pricing, "order.pricing");
  addSource(order.quote, "order.quote");
  addSource(order.quote_snapshot, "order.quote_snapshot");
  addSource(order.quoteSnapshot, "order.quoteSnapshot");
  addSource(order.pricing_summary, "order.pricing_summary");
  addSource(order.pricingSummary, "order.pricingSummary");
  addSource(order.summary, "order.summary");
  addSource(order.totals, "order.totals");
  addSource(order.quote?.pricing, "order.quote.pricing");
  addSource(order.quote?.pricing_summary, "order.quote.pricing_summary");
  addSource(order.quote?.pricingSummary, "order.quote.pricingSummary");
  addSource(order.quote?.summary, "order.quote.summary");
  addSource(order.quote?.totals, "order.quote.totals");
  addSource(order.quote_snapshot?.pricing, "order.quote_snapshot.pricing");
  addSource(order.quote_snapshot?.pricing_summary, "order.quote_snapshot.pricing_summary");
  addSource(order.quote_snapshot?.pricingSummary, "order.quote_snapshot.pricingSummary");
  addSource(order.quote_snapshot?.summary, "order.quote_snapshot.summary");
  addSource(order.quote_snapshot?.totals, "order.quote_snapshot.totals");
  addSource(order.quoteSnapshot?.pricing, "order.quoteSnapshot.pricing");
  addSource(order.quoteSnapshot?.pricing_summary, "order.quoteSnapshot.pricing_summary");
  addSource(order.quoteSnapshot?.pricingSummary, "order.quoteSnapshot.pricingSummary");
  addSource(order.quoteSnapshot?.summary, "order.quoteSnapshot.summary");
  addSource(order.quoteSnapshot?.totals, "order.quoteSnapshot.totals");
  addSource(order.pricing?.summary, "order.pricing.summary");
  addSource(order.pricing?.totals, "order.pricing.totals");

  return explicitSources;
}

function buildSourceBreakdown(source = {}) {
  const placementSubtotal =
    resolveCurrency(source.placement_subtotal) ??
    sumLineAmounts(source.placement_lines, "line_total");
  const productionLineSubtotal = sumLineAmounts(source.production_lines, "line_total");
  const productionMethodSubtotal = resolveCurrency(
    source.production_method_subtotal,
    source.production_charges_subtotal
  );
  const baseProductionSubtotal = productionMethodSubtotal ?? productionLineSubtotal;
  const productionSubtotal =
    resolveCurrency(source.production_subtotal) ??
    sumCurrencies(baseProductionSubtotal, placementSubtotal);
  const additionalFeesSubtotal =
    resolveCurrency(source.additional_fees_subtotal, source.setup_subtotal) ??
    sumLineAmounts(source.setup_fees, "amount");

  return {
    garmentSubtotal: resolveCurrency(source.garment_subtotal),
    placementSubtotal,
    productionSubtotal,
    additionalFeesSubtotal,
  };
}

function collectSourceFinancialCandidates(sourceDescriptor) {
  const { value: source, label } = sourceDescriptor;
  const candidates = { subtotal: [], tax: [], total: [] };
  const pushCandidate = (metric, amount, origin) => {
    if (amount === null) return;

    candidates[metric].push({
      amount: normalizeCurrency(amount),
      source: label,
      origin,
    });
  };

  const explicitSubtotal = resolveCurrencyFromKeys(source, SUBTOTAL_KEYS);
  const explicitTax = resolveCurrencyFromKeys(source, TAX_KEYS);
  const explicitTotal = resolveCurrencyFromKeys(source, TOTAL_KEYS);

  pushCandidate("subtotal", explicitSubtotal, "explicit");
  pushCandidate("tax", explicitTax, "explicit");
  pushCandidate("total", explicitTotal, "explicit");

  const breakdown = buildSourceBreakdown(source);
  const computedSubtotal = sumCurrencies(
    breakdown.garmentSubtotal,
    breakdown.productionSubtotal,
    breakdown.additionalFeesSubtotal
  );
  const resolvedSubtotal = explicitSubtotal ?? computedSubtotal;

  pushCandidate("subtotal", computedSubtotal, "computed_breakdown");
  pushCandidate(
    "total",
    explicitTotal ?? sumCurrencies(resolvedSubtotal, explicitTax),
    explicitTotal !== null ? "explicit_or_breakdown" : "computed_subtotal_plus_tax"
  );

  return candidates;
}

function chooseBestCandidate(candidates = []) {
  if (!candidates.length) return null;

  return candidates.find((candidate) => candidate.amount > 0) || candidates[0];
}

function buildCandidateConflict(metric, candidates = []) {
  const uniqueAmounts = [...new Set(candidates.map((candidate) => candidate.amount))];

  if (uniqueAmounts.length <= 1) {
    return null;
  }

  return {
    metric,
    amounts: uniqueAmounts,
    candidates: candidates.map((candidate) => ({
      amount: candidate.amount,
      source: candidate.source,
      origin: candidate.origin,
    })),
  };
}

function warnFinancialNormalization(order, diagnostics) {
  const orderNumber = normalizeText(order?.order_number, "unknown-order");
  const warningKey = JSON.stringify({
    orderNumber,
    unresolved: diagnostics.unresolved,
    conflicts: diagnostics.conflicts,
  });

  if (ORDER_FINANCIAL_WARNING_CACHE.has(warningKey)) {
    return;
  }

  ORDER_FINANCIAL_WARNING_CACHE.add(warningKey);

  console.warn("[orderFinancials] Financial normalization warning", {
    orderNumber,
    unresolved: diagnostics.unresolved,
    conflicts: diagnostics.conflicts,
  });
}

function resolveOrderFinancialCandidates(order = {}, options = {}) {
  const sources = buildFinancialSources(order, options);
  const totals = { subtotal: [], tax: [], total: [] };

  sources.forEach((sourceDescriptor) => {
    const sourceCandidates = collectSourceFinancialCandidates(sourceDescriptor);
    totals.subtotal.push(...sourceCandidates.subtotal);
    totals.tax.push(...sourceCandidates.tax);
    totals.total.push(...sourceCandidates.total);
  });

  const subtotalCandidate = chooseBestCandidate(totals.subtotal);
  const taxCandidate = chooseBestCandidate(totals.tax);
  const totalCandidate = chooseBestCandidate(totals.total);
  const conflicts = ["subtotal", "tax", "total"]
    .map((metric) => buildCandidateConflict(metric, totals[metric]))
    .filter(Boolean);

  const unresolved = [];

  if (!subtotalCandidate && !totalCandidate) {
    unresolved.push("missing_subtotal_and_total");
  }

  if (!totalCandidate && subtotalCandidate && !taxCandidate) {
    unresolved.push("missing_total_with_only_subtotal");
  }

  if (unresolved.length || conflicts.length) {
    warnFinancialNormalization(order, { unresolved, conflicts });
  }

  return {
    subtotalCandidate,
    taxCandidate,
    totalCandidate,
  };
}

function buildLegacyDepositPayment(order) {
  const depositAmount = normalizeCurrency(order?.deposit_amount ?? order?.deposit?.amount);
  const depositStatus = normalizeText(order?.deposit?.status).toLowerCase();

  if (depositAmount <= 0 || depositStatus !== "paid") {
    return null;
  }

  return {
    id: order?.deposit?.id || `payment-deposit-${order?.order_number || Date.now()}`,
    amount: depositAmount,
    method: normalizePaymentMethod(order?.deposit?.method),
    timestamp:
      order?.deposit?.paid_at ||
      order?.deposit?.updated_at ||
      order?.updated_at ||
      order?.created_at ||
      new Date().toISOString(),
    staff_member:
      order?.deposit?.staff_member ||
      order?.deposit?.recorded_by_staff_name ||
      order?.updated_by_staff_name ||
      "Unknown Staff",
    note: normalizeText(order?.deposit?.note, "Deposit recorded."),
  };
}

function buildSyntheticActivityEvent({
  id,
  type,
  note,
  timestamp,
  tone = "default",
  amount = null,
}) {
  return {
    id,
    type,
    note,
    tone,
    amount,
    synthetic: true,
    staff_name: "Financial System",
    staff_role: "Lifecycle",
    created_at: timestamp,
  };
}

function sortTimelineEvents(events = []) {
  return [...events].sort(
    (left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
  );
}

function dedupeTimelineEvents(events = []) {
  const seen = new Set();

  return events.filter((event, index) => {
    const key = `${event?.type || "event"}|${event?.created_at || "unknown"}|${event?.note || index}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function hasActivityType(activityLog = [], types = []) {
  const expectedTypes = new Set(types.map((type) => normalizeLower(type)));
  return activityLog.some((event) => expectedTypes.has(normalizeLower(event?.type)));
}

function resolveInvoiceDueDate(order = {}) {
  return (
    order.invoice?.due_date ||
    order.invoice_due_date ||
    order.payment_due_date ||
    order.due_date ||
    ""
  );
}

function isDraftFinancialRecord(order = {}) {
  const explicitInvoiceStatus = normalizeInvoiceWorkflowStatus(
    order.invoice?.status || order.invoice_status
  );
  const quoteStatus = normalizeLower(order.quote_status);

  if (explicitInvoiceStatus === "Draft") return true;
  if (["Sent", "Partial Payment", "Paid", "Overdue", "Refunded", "Void"].includes(explicitInvoiceStatus)) {
    return false;
  }

  return quoteStatus === "draft";
}

function isPaymentOverdue(order = {}, balanceDue = 0, invoiceStatus = "") {
  if (balanceDue <= 0 || invoiceStatus === "Void" || invoiceStatus === "Refunded") {
    return false;
  }

  const dueDate = resolveInvoiceDueDate(order);

  if (!dueDate) return false;

  const dueTimestamp = new Date(dueDate).getTime();
  if (Number.isNaN(dueTimestamp)) return false;

  return Date.now() > dueTimestamp;
}

function buildPaymentCollectionState({ totalAmount, totalPaid, depositAmount, balanceDue }) {
  if (totalAmount <= 0) return "Draft";
  if (balanceDue <= 0 && totalPaid > 0) return "Paid";
  if (depositAmount > 0 && totalPaid < depositAmount) return "Awaiting Deposit";
  if (depositAmount > 0 && totalPaid >= depositAmount && balanceDue > 0) {
    return "Awaiting Final Payment";
  }

  return totalPaid > 0 ? "Awaiting Final Payment" : "Awaiting Payment";
}

function buildInvoiceWorkflowStatus(order, { totalAmount, totalPaid, balanceDue }) {
  const explicitStatus = normalizeInvoiceWorkflowStatus(
    order.invoice?.status || order.invoice_status
  );

  if (explicitStatus === "Void" || explicitStatus === "Refunded") {
    return explicitStatus;
  }

  if (totalAmount <= 0 || isDraftFinancialRecord(order)) {
    return "Draft";
  }

  if (balanceDue <= 0 && totalPaid > 0) {
    return "Paid";
  }

  if (isPaymentOverdue(order, balanceDue, explicitStatus)) {
    return "Overdue";
  }

  if (totalPaid > 0) {
    return "Partial Payment";
  }

  if (explicitStatus === "Draft") {
    return "Draft";
  }

  return "Sent";
}

function buildConnectedFinancialHistory(order = {}, financialSummary = {}) {
  const activityLog = Array.isArray(order.activity_log) ? order.activity_log : [];
  const paymentHistory = Array.isArray(financialSummary.payment_history)
    ? [...financialSummary.payment_history].sort(
        (left, right) =>
          new Date(left?.timestamp || 0).getTime() - new Date(right?.timestamp || 0).getTime()
      )
    : [];
  const totalAmount = Number(financialSummary.total_amount || 0);
  const balanceDue = Number(financialSummary.balance_due || 0);
  const depositAmount = Number(financialSummary.deposit_amount || 0);
  const depositApplied = Number(financialSummary.deposit_applied || 0);
  const invoiceStatus = financialSummary.invoice_status || "Draft";
  const dueDate = financialSummary.invoice_due_date;
  const createdAt = order.invoice?.created_at || order.invoice_created_at || order.created_at;
  const sentAt =
    order.invoice?.sent_at ||
    order.invoice_sent_at ||
    (invoiceStatus !== "Draft" ? createdAt || order.updated_at : "");
  const history = [];
  const hasLoggedPayment = hasActivityType(activityLog, ["payment"]);
  const hasLoggedDepositRequest = hasActivityType(activityLog, ["deposit_request"]);

  if (createdAt && totalAmount > 0) {
    history.push(
      buildSyntheticActivityEvent({
        id: `invoice-created-${order.order_number || "order"}`,
        type: "invoice_created",
        note: `Invoice created for ${money(totalAmount)}.`,
        timestamp: createdAt,
      })
    );
  }

  if (sentAt && invoiceStatus !== "Draft") {
    history.push(
      buildSyntheticActivityEvent({
        id: `invoice-sent-${order.order_number || "order"}`,
        type: "invoice_sent",
        note: `Invoice sent${dueDate ? ` with payment due ${dueDate}.` : "."}`,
        timestamp: sentAt,
      })
    );
  }

  if (depositAmount > 0 && !hasLoggedDepositRequest) {
    history.push(
      buildSyntheticActivityEvent({
        id: `deposit-requested-${order.order_number || "order"}`,
        type: "deposit_requested",
        note: `Deposit requested for ${money(depositAmount)}.`,
        timestamp: order.deposit?.requested_at || sentAt || createdAt || order.updated_at,
        tone: "warning",
      })
    );
  }

  if (!hasLoggedPayment && paymentHistory.length) {
    paymentHistory.forEach((payment, index) => {
      history.push(
        buildSyntheticActivityEvent({
          id: payment.id || `payment-history-${order.order_number || "order"}-${index}`,
          type: "payment_received",
          note: `Payment received: ${money(payment.amount)} via ${payment.method}.`,
          timestamp: payment.timestamp,
          tone: "success",
          amount: payment.amount,
        })
      );
    });
  }

  if (depositApplied > 0 && !hasLoggedPayment) {
    const depositMilestonePayment = paymentHistory.find((payment) => Number(payment.amount || 0) > 0);

    history.push(
      buildSyntheticActivityEvent({
        id: `deposit-received-${order.order_number || "order"}`,
        type: "deposit_received",
        note: `Deposit received and credited: ${money(depositApplied)}.`,
        timestamp:
          order.deposit?.paid_at ||
          order.deposit?.updated_at ||
          depositMilestonePayment?.timestamp ||
          sentAt ||
          createdAt ||
          order.updated_at,
        tone: "success",
        amount: depositApplied,
      })
    );
  }

  if (!hasLoggedPayment && Number(financialSummary.total_paid || 0) > 0 && balanceDue > 0) {
    history.push(
      buildSyntheticActivityEvent({
        id: `partial-payment-${order.order_number || "order"}`,
        type: "partial_payment_recorded",
        note: `Partial payment recorded. Paid to date ${money(financialSummary.total_paid)} with ${money(balanceDue)} remaining.`,
        timestamp: paymentHistory[paymentHistory.length - 1]?.timestamp || order.updated_at,
        tone: "warning",
      })
    );
  }

  if (!hasLoggedPayment && invoiceStatus === "Paid" && paymentHistory.length) {
    history.push(
      buildSyntheticActivityEvent({
        id: `balance-complete-${order.order_number || "order"}`,
        type: "balance_completed",
        note: "Balance completed and invoice marked paid.",
        timestamp: paymentHistory[paymentHistory.length - 1]?.timestamp || order.updated_at,
        tone: "success",
      })
    );
  }

  if (invoiceStatus === "Overdue") {
    history.push(
      buildSyntheticActivityEvent({
        id: `invoice-overdue-${order.order_number || "order"}`,
        type: "invoice_overdue",
        note: `Invoice is overdue with ${money(balanceDue)} outstanding.`,
        timestamp: dueDate || order.updated_at,
        tone: "danger",
      })
    );
  }

  const connectedTimeline = sortTimelineEvents(dedupeTimelineEvents([...activityLog, ...history]));

  return {
    financial_history: sortTimelineEvents(dedupeTimelineEvents(history)),
    connected_timeline: connectedTimeline,
  };
}

export function normalizePaymentHistory(history, order = {}) {
  const normalizedHistory = Array.isArray(history)
    ? history
        .filter(Boolean)
        .map((entry, index) => ({
          id:
            entry.id ||
            `payment-${order?.order_number || "order"}-${index}-${normalizeText(entry.timestamp, Date.now())}`,
          amount: normalizeCurrency(entry.amount),
          method: normalizePaymentMethod(entry.method),
          timestamp:
            entry.timestamp ||
            entry.created_at ||
            entry.recorded_at ||
            order?.updated_at ||
            order?.created_at ||
            new Date().toISOString(),
          staff_member:
            normalizeText(entry.staff_member) ||
            normalizeText(entry.staff_name) ||
            "Unknown Staff",
          note: normalizeText(entry.note),
        }))
        .filter((entry) => entry.amount > 0)
    : [];

  const legacyDepositPayment = buildLegacyDepositPayment(order);

  if (!normalizedHistory.length && legacyDepositPayment) {
    normalizedHistory.push(legacyDepositPayment);
  }

  return normalizedHistory.sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
}

export function deriveOrderFinancials(order = {}, options = {}) {
  const paymentHistory = normalizePaymentHistory(order.payment_history, order);
  const {
    subtotalCandidate,
    taxCandidate,
    totalCandidate,
  } = resolveOrderFinancialCandidates(order, options);
  const resolvedSubtotal = subtotalCandidate?.amount ?? null;
  let resolvedTaxAmount = taxCandidate?.amount ?? null;
  let resolvedTotalAmount = totalCandidate?.amount ?? null;
  const subtotal = normalizeCurrency(
    resolvedSubtotal ??
      (resolvedTotalAmount !== null
        ? normalizeCurrency(resolvedTotalAmount - (resolvedTaxAmount ?? 0))
        : 0)
  );
  const hasDeferredLegacyTax =
    order.tax_exempt !== true &&
    [
      order.taxes_placeholder,
      order.quote?.taxes_placeholder,
      order.quote_snapshot?.taxes_placeholder,
      order.quoteSnapshot?.taxes_placeholder,
    ].some((value) => normalizeLower(value) === "calculated at checkout") &&
    subtotal > 0 &&
    (resolvedTaxAmount === null || resolvedTaxAmount === 0) &&
    (resolvedTotalAmount === null || resolvedTotalAmount <= subtotal);
  if (hasDeferredLegacyTax) {
    const repairedTotals = calculateInvoiceTax(subtotal, {
      taxRate: order.tax_rate ?? order.quote?.tax_rate ?? DEFAULT_SALES_TAX_RATE,
    });
    resolvedTaxAmount = repairedTotals.tax_amount;
    resolvedTotalAmount = repairedTotals.total_amount;
  }
  const taxAmount = normalizeCurrency(
    resolvedTaxAmount ??
      (resolvedTotalAmount !== null && resolvedSubtotal !== null
        ? Math.max(resolvedTotalAmount - resolvedSubtotal, 0)
        : 0)
  );
  const totalAmount = normalizeCurrency(
    resolvedTotalAmount ?? subtotal + taxAmount
  );
  const depositAmount = normalizeCurrency(order.deposit_amount ?? order.deposit?.amount);
  const historyPaid = normalizeCurrency(
    paymentHistory.reduce((sum, payment) => sum + normalizeCurrency(payment.amount), 0)
  );
  const totalPaid = normalizeCurrency(
    paymentHistory.length
      ? historyPaid
      : resolveCurrency(
          order.total_paid,
          order.amount_paid,
          order.paid_amount,
          order.pricing?.total_paid,
          order.pricing?.amount_paid
        ) ?? historyPaid
  );
  const balanceDue = normalizeCurrency(Math.max(totalAmount - totalPaid, 0));
  const depositApplied = normalizeCurrency(Math.min(totalPaid, depositAmount));
  const depositOutstanding = normalizeCurrency(Math.max(depositAmount - depositApplied, 0));
  const invoiceDueDate = resolveInvoiceDueDate(order);
  const invoiceStatus = buildInvoiceWorkflowStatus(order, {
    totalAmount,
    totalPaid,
    balanceDue,
  });
  const paymentStatus =
    totalAmount <= 0
      ? "Draft"
      : balanceDue <= 0 && totalPaid > 0
      ? "Paid"
      : totalPaid <= 0
      ? depositAmount > 0
        ? "Awaiting Deposit"
        : "Awaiting Payment"
      : depositAmount > 0 && totalPaid < depositAmount
      ? "Awaiting Deposit"
      : depositAmount > 0 && depositApplied > 0 && totalPaid <= depositAmount
      ? "Deposit Applied"
      : "Partial Payment";
  const paymentCollectionState = buildPaymentCollectionState({
    totalAmount,
    totalPaid,
    depositAmount,
    balanceDue,
  });
  const amountDueNow =
    paymentCollectionState === "Awaiting Deposit"
      ? normalizeCurrency(depositOutstanding || depositAmount || balanceDue)
      : balanceDue;
  const depositCreditedMessage =
    depositApplied > 0
      ? `${money(depositApplied)} deposit credited toward invoice.`
      : depositAmount > 0
      ? `Awaiting ${money(depositAmount)} deposit before final collection.`
      : "No deposit applied.";
  const balanceSummary =
    balanceDue > 0 ? `${money(balanceDue)} remaining.` : "Balance complete.";

  let pickupStatus = PICKUP_STATUS_OPTIONS.includes(order.pickup_status)
    ? order.pickup_status
    : "Pending";
  const normalizedStatus = String(order.status || "").trim();

  if (normalizedStatus === "Picked Up" || normalizedStatus === "Completed") {
    pickupStatus = "Picked Up";
  } else if (
    (normalizedStatus === "Ready for Pickup" || normalizedStatus === "Ready For Pickup") &&
    pickupStatus !== "Picked Up"
  ) {
    pickupStatus = "Ready for Pickup";
  }

  const connectedHistory = buildConnectedFinancialHistory(order, {
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    total_paid: totalPaid,
    balance_due: balanceDue,
    deposit_applied: depositApplied,
    invoice_status: invoiceStatus,
    invoice_due_date: invoiceDueDate,
    payment_history: paymentHistory,
  });
  const canonicalOrder = {
    ...order,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    total_paid: totalPaid,
    balance_due: balanceDue,
    payment_history: paymentHistory,
    payment_status: paymentStatus,
    payment_collection_state: paymentCollectionState,
    invoice_status: invoiceStatus,
  };
  const canonicalPaymentState = deriveOrderPaymentState(canonicalOrder);
  const canonicalWorkflowState = deriveOrderWorkflowState(canonicalOrder);

  return {
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    deposit_applied: depositApplied,
    deposit_outstanding: depositOutstanding,
    total_paid: totalPaid,
    paid_to_date: totalPaid,
    balance_due: balanceDue,
    remaining_balance: balanceDue,
    amount_due_now: amountDueNow,
    payment_status: paymentStatus,
    payment_collection_state: paymentCollectionState,
    invoice_status: invoiceStatus,
    canonical_payment_state: canonicalPaymentState.ownerPaymentState,
    canonical_workflow_state: canonicalWorkflowState.workflowState,
    canonical_state: {
      payment: canonicalPaymentState,
      workflow: canonicalWorkflowState,
    },
    invoice_due_date: invoiceDueDate,
    is_payment_overdue: invoiceStatus === "Overdue",
    deposit_credited_message: depositCreditedMessage,
    balance_summary: balanceSummary,
    pickup_status: pickupStatus,
    payment_history: paymentHistory,
    financial_history: connectedHistory.financial_history,
    connected_timeline: connectedHistory.connected_timeline,
  };
}

export function normalizeOrderFinancials(order = {}, options = {}) {
  return {
    ...order,
    ...deriveOrderFinancials(order, options),
  };
}
