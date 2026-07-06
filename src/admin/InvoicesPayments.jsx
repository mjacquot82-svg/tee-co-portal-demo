import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
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
  deriveOwnerOrderNextAction,
  deriveOwnerPaymentRequestNextAction,
} from "../orders/ownerWorkflowActions";
import { isCanceledOperationalStatus } from "../orders/orderWorkflow";
import { isQuoteCanceled } from "../quotes/quoteWorkflow";
import {
  buildPaymentReconciliationInsights,
  getInsightTone,
  getPaymentConfidenceLabel,
} from "../services/paymentReconciliation";
import { listPaymentReconciliationReviews } from "../lib/paymentReconciliationStore";
import PaymentRequestForm from "./PaymentRequestForm";

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

function SectionCard({ title, description, action, children }) {
  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "22px",
        border: "1px solid #e8edf3",
        display: "grid",
        gap: "16px",
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

function SummaryCard({ label, value, tone = "default", detail }) {
  const tones = {
    default: { background: "#ffffff", border: "#e2e8f0", color: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <article
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "16px",
        padding: "16px",
        display: "grid",
        gap: "6px",
      }}
    >
      <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>{label}</p>
      <h2 style={{ margin: 0, color: palette.color }}>{value}</h2>
      {detail ? <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>{detail}</p> : null}
    </article>
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

function getTonePalette(tone) {
  const palettes = {
    danger: { border: "#fecaca", background: "#fef2f2", color: "#991b1b" },
    warning: { border: "#fed7aa", background: "#fff7ed", color: "#9a3412" },
    success: { border: "#bbf7d0", background: "#ecfdf5", color: "#166534" },
  };
  return palettes[tone] || { border: "#e2e8f0", background: "#f8fafc", color: "#334155" };
}

function RequestTable({ requests, customerById, orderByNumber }) {
  if (!requests.length) {
    return <EmptyState title="No payment requests in this section." detail="Requests created from orders, quotes, or customer records will appear here." />;
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: "12px 10px" }}>Request</th>
            <th style={{ padding: "12px 10px" }}>Customer</th>
            <th style={{ padding: "12px 10px" }}>Order</th>
            <th style={{ padding: "12px 10px" }}>Type</th>
            <th style={{ padding: "12px 10px" }}>Status</th>
            <th style={{ padding: "12px 10px" }}>Requested</th>
            <th style={{ padding: "12px 10px" }}>Paid</th>
            <th style={{ padding: "12px 10px" }}>Next Action</th>
            <th style={{ padding: "12px 10px" }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const relatedOrder = orderByNumber.get(request.order_number) || null;
            const nextAction = deriveOwnerPaymentRequestNextAction(request, relatedOrder);
            return (
              <tr key={request.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                  <Link
                    to={`/admin/financial/requests/${request.id}`}
                    style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
                  >
                    {request.request_number}
                  </Link>
                </td>
                <td style={{ padding: "14px 10px" }}>
                  {customerById.get(request.customer_id)?.name || request.metadata?.customer_name || "Customer"}
                </td>
                <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                  {request.order_number ? (
                    <Link to={`/admin/orders/${request.order_number}`} style={{ color: "#334155", fontWeight: 700 }}>
                      {request.order_number}
                    </Link>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>No order</span>
                  )}
                </td>
                <td style={{ padding: "14px 10px", textTransform: "capitalize" }}>
                  {String(request.request_type || "").replace(/_/g, " ")}
                </td>
                <td style={{ padding: "14px 10px" }}>
                  <PaymentStatusBadge status={String(request.status || "open").replace(/_/g, " ")} />
                </td>
                <td style={{ padding: "14px 10px", whiteSpace: "nowrap", fontWeight: 700 }}>{money(request.amount_requested)}</td>
                <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>{money(request.amount_paid)}</td>
                <td style={{ padding: "14px 10px", minWidth: "180px" }}>
                  <Link
                    to={`/admin/financial/requests/${request.id}`}
                    style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
                  >
                    {nextAction.label}
                  </Link>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    {nextAction.detail}
                  </div>
                </td>
                <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>{formatShortDate(request.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderTable({ orders }) {
  if (!orders.length) {
    return <EmptyState title="No matching orders." detail="The existing order financial projections remain the source for deposit and production gating compatibility." />;
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: "12px 10px" }}>Order</th>
            <th style={{ padding: "12px 10px" }}>Customer</th>
            <th style={{ padding: "12px 10px" }}>Invoice</th>
            <th style={{ padding: "12px 10px" }}>Payment State</th>
            <th style={{ padding: "12px 10px" }}>Deposit</th>
            <th style={{ padding: "12px 10px" }}>Paid</th>
            <th style={{ padding: "12px 10px" }}>Balance</th>
            <th style={{ padding: "12px 10px" }}>Next Action</th>
            <th style={{ padding: "12px 10px" }}>Due</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const nextAction = deriveOwnerOrderNextAction(order);
            return (
            <tr key={order.order_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                <Link to={`/admin/orders/${order.order_number}`} style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}>
                  {order.order_number}
                </Link>
              </td>
              <td style={{ padding: "14px 10px" }}>{order.customer_name}</td>
              <td style={{ padding: "14px 10px" }}><PaymentStatusBadge status={order.invoice_status} /></td>
              <td style={{ padding: "14px 10px" }}>
                <div style={{ display: "grid", gap: "5px" }}>
                  <PaymentStatusBadge status={order.canonical_payment_state || order.payment_status} />
                  <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                    {order.canonical_workflow_state || order.payment_collection_state}
                  </span>
                </div>
              </td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                {buildDepositWorkflowLabel(order)}
              </td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>{money(order.total_paid)}</td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap", color: order.balance_due > 0 ? "#991b1b" : "#166534", fontWeight: 800 }}>
                {money(order.balance_due)}
              </td>
              <td style={{ padding: "14px 10px", minWidth: "180px" }}>
                <Link
                  to={nextAction.href || `/admin/orders/${order.order_number}`}
                  style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
                >
                  {nextAction.label}
                </Link>
                <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                  {nextAction.detail}
                </div>
              </td>
              <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                {order.invoice_due_date ? formatShortDate(order.invoice_due_date) : "—"}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function InvoicesPayments() {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  const paymentsSnapshot = usePaymentsSnapshot();
  const [, setRefreshKey] = useState(0);
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
  const awaitingBalanceRequests = openPaymentRequests.filter((request) => request.request_type === "balance");
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
  const partiallyPaidOrders = financialOrders.filter(
    (order) => order.invoice_status === "Partial Payment" || String(order.payment_status || "").includes("Partial")
  );
  const paidOrders = financialOrders.filter((order) => order.invoice_status === "Paid");
  const recentLegacyEvents = financialOrders.flatMap((order) =>
    (order.financial_history || []).map((event) => ({
      ...event,
      order_number: order.order_number,
      customer_name: order.customer_name,
      summary: event.note,
      created_at: event.created_at,
      source: "legacy",
    }))
  );
  const recentActivity = [...paymentEvents, ...recentLegacyEvents]
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
    .slice(0, 8);

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
          Payments
        </p>
        <h1 style={{ margin: "8px 0 6px" }}>Payments Dashboard</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
          Manage native payment requests while existing deposit requests, production gating, customer portal deposits, and order financial summaries continue to use their current projections.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        <SummaryCard label="Open Requests" value={openPaymentRequests.length} tone="warning" />
        <SummaryCard label="Awaiting Deposit" value={awaitingDepositRequests.length + awaitingDepositOrders.length} tone="warning" />
        <SummaryCard label="Awaiting Balance" value={awaitingBalanceRequests.length + awaitingBalanceOrders.length} tone="warning" />
        <SummaryCard label="Partially Paid" value={partiallyPaidOrders.length} />
        <SummaryCard label="Paid Orders" value={paidOrders.length} tone="success" />
        <SummaryCard label="Failed Payments" value={failedPayments.length} tone={failedPayments.length ? "danger" : "default"} />
        <SummaryCard label="Manual Review" value={manualReviewRecords.length} tone={manualReviewRecords.length ? "danger" : "default"} />
      </div>

      <PaymentRequestForm
        title="Create Payment Request"
        description="Create a customer-facing payment request from an order with an automatic Square checkout link."
        orders={financialOrders}
        onCreated={() => setRefreshKey((value) => value + 1)}
      />

      <SectionCard
        title="Open Payment Requests"
        description="Native payment request records created through the Phase 2 admin layer."
      >
        <RequestTable requests={openPaymentRequests} customerById={customerById} orderByNumber={orderByNumber} />
      </SectionCard>

      <SectionCard title="Awaiting Deposit" description="Open deposit requests plus legacy order records still waiting for deposit collection.">
        <RequestTable requests={awaitingDepositRequests} customerById={customerById} orderByNumber={orderByNumber} />
        <OrderTable orders={awaitingDepositOrders} />
      </SectionCard>

      <SectionCard title="Awaiting Balance" description="Balance requests and orders with an outstanding balance after deposits or partial payments.">
        <RequestTable requests={awaitingBalanceRequests} customerById={customerById} orderByNumber={orderByNumber} />
        <OrderTable orders={awaitingBalanceOrders} />
      </SectionCard>

      <SectionCard title="Partially Paid Orders" description="Orders whose existing financial projections show partial payment.">
        <OrderTable orders={partiallyPaidOrders} />
      </SectionCard>

      <SectionCard title="Paid Orders" description="Orders marked paid by the existing order financial summary.">
        <OrderTable orders={paidOrders} />
      </SectionCard>

      <SectionCard title="Failed Payments" description="Failed or declined native payment records and payment requests.">
        {!failedPayments.length ? (
          <EmptyState title="No failed payments." detail="Square provider failures and declined manual records will appear here." />
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {failedPayments.map((entry) => (
              <article key={entry.id} style={{ border: "1px solid #fecaca", borderRadius: "14px", padding: "14px", background: "#fff7f7" }}>
                <strong style={{ color: "#991b1b" }}>{entry.payment_number || entry.request_number || entry.id}</strong>
                <div style={{ color: "#64748b", marginTop: "4px" }}>
                  {entry.order_number || "No order"} · {money(entry.amount || entry.amount_requested)} · {formatDateTime(entry.created_at)}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Payment Reconciliation" description="Square payment confidence and manual review signals from webhook, payment, and request records.">
        <div>
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
            Open Reconciliation Workspace
          </Link>
        </div>
        {!reconciliationRecords.length ? (
          <EmptyState title="No provider reconciliation issues." detail="Square payment confidence and exception signals will appear here after provider activity." />
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {reconciliationRecords.map(({ request, insights, confidence }) => {
              const primaryInsight = insights[0] || {};
              const palette = getTonePalette(getInsightTone(primaryInsight));
              return (
                <article
                  key={request.id}
                  style={{
                    border: `1px solid ${palette.border}`,
                    borderRadius: "14px",
                    padding: "14px",
                    background: palette.background,
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <Link to={`/admin/financial/requests/${request.id}`} style={{ color: "#0f172a", fontWeight: 900 }}>
                      {request.request_number}
                    </Link>
                    <strong style={{ color: palette.color }}>{confidence}</strong>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "13px" }}>
                    {request.order_number || "No order"} · {money(request.amount_requested)} requested · {money(request.amount_paid)} paid
                  </div>
                  {insights.map((insight) => (
                    <div key={`${request.id}-${insight.code}-${insight.detail}`} style={{ color: "#475569", fontSize: "13px" }}>
                      <strong>{insight.label}:</strong> {insight.detail}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Recent Payment Activity"
        description="Native payment events followed by legacy order financial history, newest first."
        action={
          <Link
            to="/admin/financial/history"
            style={{
              border: "1px solid #d6dbe4",
              background: "#ffffff",
              color: "#334155",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            View Full Payment History
          </Link>
        }
      >
        {!recentActivity.length ? (
          <EmptyState title="No payment activity yet." detail="Payment requests, manual payments, and legacy financial history will surface here." />
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {recentActivity.map((event) => (
              <article
                key={event.id || `${event.order_number}-${event.created_at}-${event.summary}`}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#fcfcfd",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <strong style={{ color: "#0f172a" }}>{event.summary || event.event_type}</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", color: "#64748b", fontSize: "13px" }}>
                  {event.order_number ? <span style={{ fontWeight: 700, color: "#334155" }}>{event.order_number}</span> : null}
                  {event.customer_name ? <span>{event.customer_name}</span> : null}
                  <span>{formatDateTime(event.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
