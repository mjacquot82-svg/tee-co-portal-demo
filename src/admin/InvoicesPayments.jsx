import { Link } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { useStoredOrders } from "../lib/ordersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { isCanceledOperationalStatus } from "../orders/orderWorkflow";
import { isQuoteCanceled } from "../quotes/quoteWorkflow";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
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
        borderRadius: "18px",
        padding: "18px",
        display: "grid",
        gap: "8px",
      }}
    >
      <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>{label}</p>
      <h2 style={{ margin: 0, color: palette.color }}>{value}</h2>
      {detail ? <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>{detail}</p> : null}
    </article>
  );
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

function buildStatusCounts(orders = []) {
  return orders.reduce(
    (summary, order) => {
      const invoiceStatus = order.invoice_status || "Draft";
      const paymentCollectionState = order.payment_collection_state || "Awaiting Payment";

      summary.invoice[invoiceStatus] = (summary.invoice[invoiceStatus] || 0) + 1;
      summary.collection[paymentCollectionState] = (summary.collection[paymentCollectionState] || 0) + 1;
      return summary;
    },
    { invoice: {}, collection: {} }
  );
}

function buildRecentFinancialEvents(orders = [], limit = 4) {
  return orders
    .flatMap((order) =>
      (order.financial_history || []).map((event) => ({
        ...event,
        order_number: order.order_number,
        customer_name: order.customer_name,
      }))
    )
    .sort(
      (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    )
    .slice(0, limit);
}

function isActiveFinancialWorkflowOrder(order) {
  return !isCanceledOperationalStatus(order.status) && !isQuoteCanceled(order);
}

function QueueHint({ label, value, tone = "default" }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", color: "#334155" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: "16px",
        padding: "14px 16px",
        display: "grid",
        gap: "4px",
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </span>
      <strong style={{ fontSize: "22px" }}>{value}</strong>
    </div>
  );
}

export default function InvoicesPayments() {
  const orders = useStoredOrders();
  const financialOrders = orders.map((order) => normalizeOrderFinancials(order));
  const activeFinancialOrders = financialOrders.filter(isActiveFinancialWorkflowOrder);
  const statusCounts = buildStatusCounts(activeFinancialOrders);
  const overdueInvoices = activeFinancialOrders.filter((order) => order.invoice_status === "Overdue");
  const unpaidInvoices = activeFinancialOrders.filter((order) => Number(order.balance_due || 0) > 0);
  const partiallyPaidInvoices = activeFinancialOrders.filter(
    (order) => order.invoice_status === "Partial Payment"
  );
  const awaitingDepositInvoices = activeFinancialOrders.filter(
    (order) => order.payment_collection_state === "Awaiting Deposit"
  );
  const paidInvoices = activeFinancialOrders.filter((order) => order.invoice_status === "Paid");
  const recentFinancialEvents = buildRecentFinancialEvents(financialOrders);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <div style={{ marginBottom: "4px" }}>
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
          Financial Workflow
        </p>
        <h1 style={{ margin: "8px 0 6px" }}>Invoices & Payments</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
          Work the billing queue here: deposits, invoices, balances due, and payment follow-up. Detailed historical lookup lives in its own view so this screen can stay operationally calm.
        </p>
      </div>

      <SectionCard
        title="Billing Queue"
        description="One queue for invoice state, payment stage, deposits credited, and amount still due."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          <SummaryCard label="Draft" value={statusCounts.invoice.Draft || 0} />
          <SummaryCard label="Sent" value={statusCounts.invoice.Sent || 0} />
          <SummaryCard label="Partial Payment" value={statusCounts.invoice["Partial Payment"] || 0} tone="warning" />
          <SummaryCard label="Paid" value={statusCounts.invoice.Paid || 0} tone="success" />
          <SummaryCard label="Overdue" value={statusCounts.invoice.Overdue || 0} tone="danger" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          <QueueHint label="Overdue Balances" value={overdueInvoices.length} tone="danger" />
          <QueueHint label="Awaiting Deposit" value={awaitingDepositInvoices.length} tone="warning" />
          <QueueHint label="Open Balances" value={unpaidInvoices.length} tone="warning" />
          <QueueHint label="Paid In Full" value={paidInvoices.length} tone="success" />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#ffffff" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 10px" }}>Invoice</th>
                <th style={{ padding: "12px 10px" }}>Customer</th>
                <th style={{ padding: "12px 10px" }}>Invoice State</th>
                <th style={{ padding: "12px 10px" }}>Payment State</th>
                <th style={{ padding: "12px 10px" }}>Deposit Applied</th>
                <th style={{ padding: "12px 10px" }}>Paid To Date</th>
                <th style={{ padding: "12px 10px" }}>Remaining Balance</th>
                <th style={{ padding: "12px 10px" }}>Amount Due Now</th>
                <th style={{ padding: "12px 10px" }}>Due Date</th>
                <th style={{ padding: "12px 10px" }}>Latest Financial Event</th>
              </tr>
            </thead>
            <tbody>
              {activeFinancialOrders.length ? (
                activeFinancialOrders.map((order) => {
                  const latestEvent = order.financial_history?.[0] || order.connected_timeline?.[0] || null;

                  return (
                    <tr key={order.order_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                        <Link
                          to={`/admin/orders/${order.order_number}`}
                          style={{ color: "#0f172a", fontWeight: 700, textDecoration: "none" }}
                        >
                          {order.order_number}
                        </Link>
                        <div style={{ marginTop: "4px", color: "#64748b", fontSize: "12px" }}>
                          Total {money(order.total_amount)}
                        </div>
                      </td>
                      <td style={{ padding: "14px 10px" }}>{order.customer_name}</td>
                      <td style={{ padding: "14px 10px" }}>
                        <PaymentStatusBadge status={order.invoice_status} />
                      </td>
                      <td style={{ padding: "14px 10px" }}>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <PaymentStatusBadge status={order.payment_status} />
                          <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                            {order.payment_collection_state}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 700 }}>{money(order.deposit_applied)}</div>
                        <div style={{ color: "#64748b", fontSize: "12px" }}>
                          Target {money(order.deposit_amount)}
                        </div>
                      </td>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>{money(order.total_paid)}</td>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap", color: order.balance_due > 0 ? "#991b1b" : "#166534", fontWeight: 700 }}>
                        {money(order.balance_due)}
                      </td>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap" }}>{money(order.amount_due_now)}</td>
                      <td style={{ padding: "14px 10px", whiteSpace: "nowrap", color: order.is_payment_overdue ? "#b91c1c" : "#475569", fontWeight: 700 }}>
                        {order.invoice_due_date ? formatShortDate(order.invoice_due_date) : "—"}
                      </td>
                      <td style={{ padding: "14px 10px", minWidth: "250px" }}>
                        {latestEvent ? (
                          <div style={{ display: "grid", gap: "4px" }}>
                            <span style={{ color: "#0f172a", fontWeight: 700 }}>{latestEvent.note}</span>
                            <span style={{ color: "#64748b", fontSize: "12px" }}>
                              {formatDateTime(latestEvent.created_at)}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No financial activity recorded.</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ padding: "24px 18px" }}>
                    <div style={{ display: "grid", gap: "8px", color: "#64748b" }}>
                      <strong style={{ color: "#0f172a" }}>No invoice activity yet.</strong>
                      <span>Orders with billing activity will populate this queue as invoices and payments start moving.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent Financial Activity"
        description="A compact preview of the newest billing movement. Use the full history view for deeper lookup."
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
            View Full Financial History
          </Link>
        }
      >
        {!recentFinancialEvents.length ? (
          <div
            style={{
              border: "1px dashed #d6dbe4",
              borderRadius: "18px",
              padding: "24px 18px",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong style={{ color: "#0f172a" }}>No financial history recorded yet.</strong>
            <span style={{ color: "#64748b" }}>
              Billing milestones will surface here once deposits, invoice sends, or payments are recorded.
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {recentFinancialEvents.map((event) => (
              <article
                key={`${event.order_number}-${event.id}`}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#fcfcfb",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <strong style={{ color: "#0f172a" }}>{event.note}</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", color: "#64748b", fontSize: "13px" }}>
                  <span style={{ fontWeight: 700, color: "#334155" }}>{event.order_number}</span>
                  <span>{event.customer_name}</span>
                  <span>{formatDateTime(event.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "14px 16px",
              background: "#f8fafc",
              display: "grid",
              gap: "4px",
            }}
          >
            <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Partial Payments
            </span>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>{partiallyPaidInvoices.length}</strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              Orders that still need additional payment collection.
            </span>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "14px 16px",
              background: "#f8fafc",
              display: "grid",
              gap: "4px",
            }}
          >
            <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Queue Focus
            </span>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>
              {overdueInvoices.length + awaitingDepositInvoices.length}
            </strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              Records needing immediate billing attention before history review.
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
