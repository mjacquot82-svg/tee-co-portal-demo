import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/dateFormatting";
import { useStoredOrders } from "../lib/ordersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";

const PAGE_SIZE = 20;

function buildFinancialEvents(orders = []) {
  return orders
    .flatMap((order) =>
      (order.financial_history || []).map((event) => ({
        ...event,
        order_number: order.order_number,
        customer_name: order.customer_name,
        invoice_status: order.invoice_status,
        payment_collection_state: order.payment_collection_state,
      }))
    )
    .sort(
      (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    );
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function SummaryStat({ label, value, detail }) {
  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "18px",
        padding: "18px",
        display: "grid",
        gap: "6px",
      }}
    >
      <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>{label}</span>
      <strong style={{ color: "#0f172a", fontSize: "28px" }}>{value}</strong>
      <span style={{ color: "#64748b", fontSize: "13px" }}>{detail}</span>
    </article>
  );
}

export default function FinancialHistory() {
  const orders = useStoredOrders();
  const financialOrders = useMemo(
    () => orders.map((order) => normalizeOrderFinancials(order)),
    [orders]
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const allEvents = useMemo(() => buildFinancialEvents(financialOrders), [financialOrders]);

  const filteredEvents = useMemo(() => {
    const query = normalize(searchTerm);
    if (!query) return allEvents;

    return allEvents.filter((event) =>
      [event.note, event.order_number, event.customer_name, event.invoice_status, event.payment_collection_state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [allEvents, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const recent24HoursCount = allEvents.filter((event) => {
    const timestamp = new Date(event.created_at || "").getTime();
    if (!timestamp) return false;
    return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
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
          <h1 style={{ margin: "8px 0 6px" }}>Payment History</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "780px" }}>
            Full billing activity lives here so Payments can stay focused on balances, deposits, and invoices that need attention now.
          </p>
        </div>

        <Link
          to="/admin/financial"
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
          Back to Payments
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <SummaryStat
          label="Recorded Events"
          value={allEvents.length}
          detail="Complete payment activity available for lookup."
        />
        <SummaryStat
          label="Last 24 Hours"
          value={recent24HoursCount}
          detail="Recent billing movement across invoices and payments."
        />
        <SummaryStat
          label="Orders With History"
          value={financialOrders.filter((order) => (order.financial_history || []).length).length}
          detail="Customer orders contributing to the payment timeline."
        />
      </section>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          padding: "20px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 6px" }}>Lookup Timeline</h2>
            <p style={{ margin: 0, color: "#64748b" }}>
              Search by note, order, customer, or workflow state.
            </p>
          </div>
          <span style={{ color: "#64748b", fontSize: "14px", fontWeight: 700 }}>
            {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
          </span>
        </div>

        <input
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setPage(1);
          }}
          placeholder="Search note, order number, customer, or status..."
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "12px 14px",
            fontSize: "15px",
            width: "100%",
            boxSizing: "border-box",
            background: "#ffffff",
          }}
        />

        {!paginatedEvents.length ? (
          <div
            style={{
              border: "1px dashed #d6dbe4",
              borderRadius: "18px",
              padding: "28px 20px",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong style={{ color: "#0f172a" }}>No payment events match this lookup.</strong>
            <span style={{ color: "#64748b" }}>
              Clear or widen the search to bring more billing history back into view.
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {paginatedEvents.map((event) => (
              <article
                key={`${event.order_number}-${event.id}-${event.created_at}`}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "#fcfcfb",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "5px" }}>
                    <strong style={{ color: "#0f172a" }}>{event.note || "Payment event"}</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", color: "#64748b", fontSize: "13px" }}>
                      <Link to={`/admin/orders/${event.order_number}`} style={{ color: "#0f172a", fontWeight: 700, textDecoration: "none" }}>
                        {event.order_number}
                      </Link>
                      <span>{event.customer_name || "Walk-in Customer"}</span>
                      {event.invoice_status ? <span>Invoice {event.invoice_status}</span> : null}
                      {event.payment_collection_state ? <span>{event.payment_collection_state}</span> : null}
                    </div>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                    {formatDateTime(event.created_at)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        {filteredEvents.length > PAGE_SIZE ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              borderTop: "1px solid #f1f5f9",
              paddingTop: "12px",
            }}
          >
            <span style={{ color: "#64748b", fontSize: "14px" }}>
              Page {currentPage} of {totalPages}
            </span>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
                style={{
                  border: "1px solid #d6dbe4",
                  background: "#ffffff",
                  color: "#334155",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  opacity: currentPage === 1 ? 0.55 : 1,
                }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage === totalPages}
                style={{
                  border: "1px solid #d6dbe4",
                  background: "#ffffff",
                  color: "#334155",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage === totalPages ? 0.55 : 1,
                }}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
