import { Link } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { useStoredOrders } from "../lib/ordersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";

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

function SectionCard({ title, description, children }) {
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
      <div>
        <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b" }}>{description}</p>
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

function buildRecentFinancialEvents(orders = []) {
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
    .slice(0, 12);
}

export default function InvoicesPayments() {
  const orders = useStoredOrders();
  const financialOrders = orders.map((order) => normalizeOrderFinancials(order));
  const statusCounts = buildStatusCounts(financialOrders);
  const totalOutstanding = financialOrders.reduce(
    (total, order) => total + Number(order.balance_due || 0),
    0
  );
  const totalDepositsApplied = financialOrders.reduce(
    (total, order) => total + Number(order.deposit_applied || 0),
    0
  );
  const totalPaid = financialOrders.reduce(
    (total, order) => total + Number(order.total_paid || 0),
    0
  );
  const overdueInvoices = financialOrders.filter((order) => order.invoice_status === "Overdue");
  const unpaidInvoices = financialOrders.filter((order) => Number(order.balance_due || 0) > 0);
  const partiallyPaidInvoices = financialOrders.filter(
    (order) => order.invoice_status === "Partial Payment"
  );
  const awaitingDepositInvoices = financialOrders.filter(
    (order) => order.payment_collection_state === "Awaiting Deposit"
  );
  const paidInvoices = financialOrders.filter((order) => order.invoice_status === "Paid");
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
          Work the billing queue here: deposits, invoices, balances due, and payment history. Production status and assignment follow-up stay in their own workspaces.
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
              {financialOrders.map((order) => {
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
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div
        style={{
          display: "grid",
          gap: "20px",
        }}
      >
        <SectionCard
          title="Recent Financial History"
          description="Recent billing milestones so payment follow-up stays traceable without turning this page into another operations dashboard."
        >
          {!recentFinancialEvents.length ? (
            <p style={{ margin: 0, color: "#94a3b8" }}>No financial history recorded yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {recentFinancialEvents.map((event) => (
                <article
                  key={`${event.order_number}-${event.id}`}
                  style={{
                    borderLeft: "4px solid #171717",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <strong style={{ display: "block", color: "#0f172a" }}>{event.note}</strong>
                  <span style={{ display: "block", marginTop: "6px", color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                    {event.order_number} • {event.customer_name} • {formatDateTime(event.created_at)}
                  </span>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
