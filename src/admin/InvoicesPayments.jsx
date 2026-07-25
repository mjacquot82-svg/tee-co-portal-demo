import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime } from "../lib/dateFormatting";
import { useStoredCustomers } from "../lib/customersStore";
import { useStoredOrders } from "../lib/ordersStore";
import {
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  usePaymentsSnapshot,
} from "../lib/paymentsStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { buildDepositWorkflowLabel } from "../orders/depositWorkflowDisplay";
import {
  deriveOwnerPaymentRequestNextAction,
} from "../orders/ownerWorkflowActions";
import { isCanceledOperationalStatus } from "../orders/orderWorkflow";
import { isQuoteCanceled } from "../quotes/quoteWorkflow";
import {
  buildPaymentReconciliationInsights,
  getPaymentConfidenceLabel,
} from "../services/paymentReconciliation";
import { listPaymentReconciliationReviews } from "../lib/paymentReconciliationStore";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function isActiveFinancialWorkflowOrder(order) {
  return !isCanceledOperationalStatus(order.status) && !isQuoteCanceled(order);
}

function isOpenRequest(request) {
  return !["paid", "canceled", "cancelled", "expired", "failed"].includes(String(request.status || "").toLowerCase());
}

function isFailedPayment(payment) {
  return ["failed", "voided", "declined"].includes(String(payment.status || "").toLowerCase());
}

function resolveCustomerIdentity({ customer = null, order = null, request = null }) {
  const candidates = [
    customer?.name,
    customer?.company,
    order?.customer_name,
    request?.metadata?.customer_name,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const customerName = candidates.find((value) => !value.includes("@"));

  if (customerName) return customerName;

  return (
    [
      customer?.email,
      order?.customer_email,
      request?.metadata?.customer_email,
      ...candidates,
    ]
      .map((value) => String(value || "").trim())
      .find(Boolean) || "Customer"
  );
}

function SectionCard({ id, highlighted = false, title, description, action, children }) {
  return (
    <section
      id={id}
      style={{
        background: highlighted ? "#fffbeb" : "#ffffff",
        borderRadius: "20px",
        padding: "22px",
        border: highlighted ? "2px solid #f59e0b" : "1px solid #e8edf3",
        display: "grid",
        gap: "16px",
        scrollMarginTop: "24px",
        transition: "background-color 180ms ease, border-color 180ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
          <p style={{ margin: 0, color: "#64748b" }}>{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value, tone = "default", detail, onClick }) {
  const tones = {
    default: { background: "#ffffff", border: "#e2e8f0", color: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "16px",
        padding: "16px",
        display: "grid",
        gap: "6px",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
      }}
      aria-label={`Go to ${label}`}
    >
      <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>{label}</p>
      <h2 style={{ margin: 0, color: palette.color }}>{value}</h2>
      {detail ? <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>{detail}</p> : null}
    </button>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: "16px",
        padding: "18px",
        display: "grid",
        gap: "6px",
        color: "#64748b",
      }}
    >
      <strong style={{ color: "#0f172a" }}>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function buildAttentionRows({ requests, orders, customerById, orderByNumber, responsibility }) {
  const requestedOrderNumbers = new Set(requests.map((request) => request.order_number).filter(Boolean));
  const requestRows = requests.map((request) => {
    const order = orderByNumber.get(request.order_number) || null;
    const customer = customerById.get(request.customer_id) || null;
    return {
      key: `request-${request.id}`,
      customer: resolveCustomerIdentity({ customer, order, request }),
      orderNumber: request.order_number || "",
      amountDue: Math.max(0, Number(request.amount_requested || 0) - Number(request.amount_paid || 0)),
      responsibility: String(request.request_type || responsibility).replace(/_/g, " "),
      status: String(request.status || "open").replace(/_/g, " "),
      nextAction: deriveOwnerPaymentRequestNextAction(request, order),
      actionLabel: "Follow Up on Payment",
      href: `/admin/financial/requests/${request.id}`,
    };
  });
  const orderRows = orders
    .filter((order) => !requestedOrderNumbers.has(order.order_number))
    .map((order) => ({
      key: `order-${order.order_number}-${responsibility}`,
      customer: resolveCustomerIdentity({
        customer: customerById.get(order.customer_id) || null,
        order,
      }),
      orderNumber: order.order_number,
      amountDue:
        responsibility === "deposit"
          ? Math.max(
              0,
              Number(order.deposit_amount || 0) -
                Number(order.deposit_applied || order.deposit_paid_amount || 0)
            )
          : Math.max(0, Number(order.balance_due || 0)),
      responsibility,
      status:
        responsibility === "deposit"
          ? buildDepositWorkflowLabel(order)
          : order.canonical_payment_state || order.payment_collection_state || order.invoice_status,
      nextAction: {
        detail: "Create the request from this order so its customer and balance are already selected.",
      },
      actionLabel: "Create Payment Request",
      href: `/admin/orders/${order.order_number}?workspace=financial#owner-payment-request-form`,
    }));

  return [...requestRows, ...orderRows];
}

function AttentionTable({ rows, emptyTitle, emptyDetail }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: "12px 10px" }}>Customer</th>
            <th style={{ padding: "12px 10px" }}>Order</th>
            <th style={{ padding: "12px 10px" }}>Amount Due</th>
            <th style={{ padding: "12px 10px" }}>For</th>
            <th style={{ padding: "12px 10px" }}>Financial Status</th>
            <th style={{ padding: "12px 10px" }}>Next Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "14px 10px", fontWeight: 800 }}>{row.customer}</td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                {row.orderNumber ? (
                  <Link to={`/admin/orders/${row.orderNumber}`} style={{ color: "#334155", fontWeight: 700 }}>
                    {row.orderNumber}
                  </Link>
                ) : (
                  <span style={{ color: "#94a3b8" }}>No order</span>
                )}
              </td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap", color: "#991b1b", fontWeight: 900 }}>
                {money(row.amountDue)}
              </td>
              <td style={{ padding: "14px 10px", textTransform: "capitalize" }}>{row.responsibility}</td>
              <td style={{ padding: "14px 10px" }}><PaymentStatusBadge status={row.status} /></td>
              <td style={{ padding: "14px 10px", minWidth: "210px" }}>
                <Link
                  to={row.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    padding: "9px 12px",
                    background: "#0f172a",
                    color: "#ffffff",
                    fontWeight: 900,
                    textDecoration: "none",
                  }}
                >
                  {row.actionLabel}
                </Link>
                <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                  {row.nextAction.detail}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InvoicesPayments() {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  const paymentsSnapshot = usePaymentsSnapshot();
  const [highlightedSection, setHighlightedSection] = useState("");
  const highlightTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    },
    []
  );

  function goToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedSection(sectionId);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedSection(""), 1400);
  }
  const financialOrders = useMemo(
    () => orders.map((order) => normalizeOrderFinancials(order)).filter(isActiveFinancialWorkflowOrder),
    [orders]
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );
  const orderByNumber = useMemo(
    () => new Map(financialOrders.map((order) => [order.order_number, order])),
    [financialOrders]
  );
  const paymentRequests = paymentsSnapshot.paymentRequests.length ? paymentsSnapshot.paymentRequests : listPaymentRequests();
  const payments = paymentsSnapshot.payments.length ? paymentsSnapshot.payments : listPayments();
  const paymentEvents = paymentsSnapshot.paymentEvents.length ? paymentsSnapshot.paymentEvents : listPaymentEvents();
  const reconciliationReviews = listPaymentReconciliationReviews();
  const reconciliationRecords = paymentRequests
    .map((request) => {
      const insights = buildPaymentReconciliationInsights({
        paymentRequest: request,
        payments,
        paymentEvents,
        reviews: reconciliationReviews,
      });
      return {
        request,
        insights,
        confidence: getPaymentConfidenceLabel(insights, request),
      };
    })
    .filter(
      (record) =>
        record.confidence !== "No Provider Activity" ||
        record.insights.some((insight) => insight.severity === "high" || insight.severity === "medium")
    );
  const manualReviewRecords = reconciliationRecords.filter((record) =>
    record.insights.some((insight) => insight.severity === "high")
  );

  const openPaymentRequests = paymentRequests.filter(isOpenRequest);
  const awaitingDepositRequests = openPaymentRequests.filter((request) => request.request_type === "deposit");
  const awaitingBalanceRequests = openPaymentRequests.filter((request) => request.request_type !== "deposit");
  const failedPayments = [
    ...payments.filter(isFailedPayment),
    ...paymentRequests.filter((request) => String(request.status || "").toLowerCase() === "failed"),
  ];
  const awaitingDepositOrders = financialOrders.filter(
    (order) =>
      (order.canonical_payment_state || order.payment_collection_state) === "Deposit Required" ||
      order.payment_collection_state === "Awaiting Deposit"
  );
  const awaitingBalanceOrders = financialOrders.filter(
    (order) =>
      (order.canonical_payment_state || order.payment_collection_state) !== "Deposit Required" &&
      order.payment_collection_state !== "Awaiting Deposit" &&
      Number(order.balance_due || 0) > 0
  );
  const depositAttentionRows = buildAttentionRows({
    requests: awaitingDepositRequests,
    orders: awaitingDepositOrders,
    customerById,
    orderByNumber,
    responsibility: "deposit",
  });
  const balanceAttentionRows = buildAttentionRows({
    requests: awaitingBalanceRequests,
    orders: awaitingBalanceOrders,
    customerById,
    orderByNumber,
    responsibility: "balance",
  });

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <div>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Financial
        </p>
        <h1 style={{ margin: "8px 0 6px" }}>Money Needing Attention</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
          See who owes money, how much is due, and what to do next.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        <SummaryCard label="Awaiting Deposit" value={depositAttentionRows.length} tone="warning" onClick={() => goToSection("awaiting-deposit")} />
        <SummaryCard label="Awaiting Balance" value={balanceAttentionRows.length} tone="warning" onClick={() => goToSection("awaiting-balance")} />
        <SummaryCard label="Failed Payments" value={failedPayments.length} tone={failedPayments.length ? "danger" : "default"} onClick={() => goToSection("failed-payments")} />
        {manualReviewRecords.length ? (
          <SummaryCard label="Manual Review" value={manualReviewRecords.length} tone="danger" />
        ) : null}
      </div>

      <SectionCard
        title="Financial Tools"
        description="Open completed payment history or investigate unusual payment situations that need owner attention, such as duplicates, failures, mismatches, or manual review cases."
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to="/admin/financial/history"
            style={{
              display: "inline-flex",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "10px 13px",
              color: "#0f172a",
              fontWeight: 800,
              textDecoration: "none",
              background: "#ffffff",
            }}
          >
            View Payment History
          </Link>
          <Link
            to="/admin/financial/reconciliation"
            style={{
              display: "inline-flex",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "10px 13px",
              color: "#0f172a",
              fontWeight: 800,
              textDecoration: "none",
              background: "#ffffff",
            }}
          >
            Payment Exceptions
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        id="awaiting-deposit"
        highlighted={highlightedSection === "awaiting-deposit"}
        title="Awaiting Deposit"
        description="Orders that need a deposit before work can move forward."
      >
        <AttentionTable
          rows={depositAttentionRows}
          emptyTitle="No deposits need attention."
          emptyDetail="Orders waiting for a deposit will appear here."
        />
      </SectionCard>

      <SectionCard
        id="awaiting-balance"
        highlighted={highlightedSection === "awaiting-balance"}
        title="Awaiting Balance"
        description="Orders with money still owing after deposits or partial payments."
      >
        <AttentionTable
          rows={balanceAttentionRows}
          emptyTitle="No balances need attention."
          emptyDetail="Orders with an outstanding balance will appear here."
        />
      </SectionCard>

      <SectionCard
        id="failed-payments"
        highlighted={highlightedSection === "failed-payments"}
        title="Failed Payments"
        description="Payment attempts that need owner follow-up."
      >
        {!failedPayments.length ? (
          <EmptyState title="No failed payments." detail="Failed or declined payment attempts will appear here." />
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {failedPayments.map((entry) => (
              <article key={entry.id} style={{ border: "1px solid #fecaca", borderRadius: "14px", padding: "14px", background: "#fff7f7" }}>
                {entry.request_number ? (
                  <Link to={`/admin/financial/requests/${entry.id}`} style={{ color: "#991b1b", fontWeight: 900 }}>
                    Review failed payment
                  </Link>
                ) : (
                  <strong style={{ color: "#991b1b" }}>Review failed payment</strong>
                )}
                <div style={{ color: "#64748b", marginTop: "4px" }}>
                  {entry.order_number || "No order"} · {money(entry.amount || entry.amount_requested)} · {formatDateTime(entry.created_at)}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  );
}
