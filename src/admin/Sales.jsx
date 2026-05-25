import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatShortDate } from "../lib/dateFormatting";
import { getStoredQuickSales } from "../lib/salesStore";

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const summaryCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  padding: "18px",
  display: "grid",
  gap: "6px",
};

const DATE_FILTER_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function buildStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function buildEndOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function shiftDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function buildDateRange(filter, customStartDate, customEndDate) {
  const now = new Date();

  if (filter === "today") {
    return {
      start: buildStartOfDay(now),
      end: buildEndOfDay(now),
      label: "Today",
    };
  }

  if (filter === "last7") {
    return {
      start: buildStartOfDay(shiftDays(now, -6)),
      end: buildEndOfDay(now),
      label: "Last 7 days",
    };
  }

  if (filter === "thisMonth") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: buildEndOfDay(now),
      label: "This month",
    };
  }

  if (filter === "lastMonth") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      label: "Last month",
    };
  }

  if (filter === "custom") {
    const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
    const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : null;

    if (start && end && start.getTime() > end.getTime()) {
      return {
        start: new Date(`${customEndDate}T00:00:00`),
        end: new Date(`${customStartDate}T23:59:59.999`),
        label: "Custom range",
      };
    }

    return {
      start,
      end,
      label: "Custom range",
    };
  }

  return {
    start: null,
    end: null,
    label: "All recorded history",
  };
}

function matchesDateRange(value, range) {
  if (!range.start && !range.end) return true;

  const timestamp = new Date(value || "").getTime();
  if (!timestamp) return false;

  if (range.start && timestamp < range.start.getTime()) return false;
  if (range.end && timestamp > range.end.getTime()) return false;
  return true;
}

function buildDateRangeLabel(filter, range, count) {
  if (filter === "custom") {
    if (range.start && range.end) {
      return `${formatShortDate(range.start)} to ${formatShortDate(range.end)}`;
    }
    if (range.start) {
      return `From ${formatShortDate(range.start)}`;
    }
    if (range.end) {
      return `Through ${formatShortDate(range.end)}`;
    }
    return count ? "Custom range" : "Set a custom range";
  }

  return range.label;
}

function FilterChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: "999px",
        border: active ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
        background: active ? "#f1f5f9" : "#ffffff",
        color: active ? "#0f172a" : "#475569",
        padding: "10px 14px",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("last7");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    setSales(getStoredQuickSales());
  }, []);

  const paymentMethods = useMemo(() => {
    return Array.from(
      new Set(sales.map((sale) => sale.payment_method).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }, [sales]);

  const dateRange = useMemo(
    () => buildDateRange(dateFilter, customStartDate, customEndDate),
    [customEndDate, customStartDate, dateFilter]
  );

  const filteredSales = useMemo(() => {
    const query = normalize(searchTerm);

    return sales.filter((sale) => {
      const matchesQuery =
        !query ||
        [
          sale.sale_number,
          sale.customer_name,
          sale.payment_method,
          sale.payment_status,
          sale.payment_reference,
          ...(sale.production_order_numbers || []),
          ...(sale.items || []).map((item) => item.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        statusFilter === "all" || sale.payment_status === statusFilter;
      const matchesMethod =
        methodFilter === "all" || sale.payment_method === methodFilter;
      const matchesTime = matchesDateRange(sale.created_at, dateRange);

      return matchesQuery && matchesStatus && matchesMethod && matchesTime;
    });
  }, [dateRange, methodFilter, sales, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    return {
      grossSales: filteredSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
      totalPaid: filteredSales.reduce(
        (sum, sale) => sum + Number((sale.amount_paid ?? sale.total) || 0),
        0
      ),
      balanceDue: filteredSales.reduce(
        (sum, sale) => sum + Number(sale.balance_due || 0),
        0
      ),
      linkedOrders: filteredSales.reduce(
        (sum, sale) => sum + (sale.production_order_numbers || []).length,
        0
      ),
    };
  }, [filteredSales]);

  const dateRangeLabel = buildDateRangeLabel(dateFilter, dateRange, filteredSales.length);
  const hasFilters =
    searchTerm.trim() ||
    statusFilter !== "all" ||
    methodFilter !== "all" ||
    dateFilter !== "last7" ||
    customStartDate ||
    customEndDate;

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setMethodFilter("all");
    setDateFilter("last7");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  return (
    <div
      style={{
        maxWidth: "1240px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Front Counter
          </p>
          <h1 style={{ margin: "6px 0 8px" }}>Sales History</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
            Review completed counter transactions, partial payments, and production-linked walk-in sales without turning this workspace into an endless feed.
          </p>
        </div>

        <Link
          to="/admin/sales/new"
          style={{
            background: "#171717",
            color: "#ffffff",
            borderRadius: "12px",
            padding: "12px 16px",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          New Counter Sale
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Transactions
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {filteredSales.length}
          </strong>
          <span style={{ color: "#475569" }}>
            {dateRangeLabel} in the current history view.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Gross Sales
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {currency(summary.grossSales)}
          </strong>
          <span style={{ color: "#475569" }}>
            Total value of the filtered counter transactions.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Collected
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {currency(summary.totalPaid)}
          </strong>
          <span style={{ color: "#475569" }}>
            Cash received or recorded against these sales.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Balance Due
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {currency(summary.balanceDue)}
          </strong>
          <span style={{ color: "#475569" }}>
            Remaining front-counter balance still open.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Linked Production Orders
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {summary.linkedOrders}
          </strong>
          <span style={{ color: "#475569" }}>
            Counter sales tied back to production work.
          </span>
        </article>
      </section>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "18px",
          display: "grid",
          gap: "16px",
          marginBottom: "18px",
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
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ color: "#0f172a" }}>Lookup Window</strong>
            <span style={{ color: "#64748b", fontSize: "14px" }}>
              Start with time, then narrow with search only when needed.
            </span>
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "10px 12px",
                fontWeight: 700,
                color: "#334155",
                cursor: "pointer",
              }}
            >
              Reset Filters
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <FilterChip active={dateFilter === "all"} onClick={() => setDateFilter("all")}>
            All History
          </FilterChip>
          {DATE_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={dateFilter === option.value}
              onClick={() => setDateFilter(option.value)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>

        {dateFilter === "custom" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 220px))",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                Start date
              </span>
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                End date
              </span>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(160px, 0.7fr))",
            gap: "12px",
          }}
        >
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search sale, customer, order, or item..."
            style={fieldStyle}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={fieldStyle}
          >
            <option value="all">All statuses</option>
            {Array.from(
              new Set(sales.map((sale) => sale.payment_status).filter(Boolean))
            ).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={methodFilter}
            onChange={(event) => setMethodFilter(event.target.value)}
            style={fieldStyle}
          >
            <option value="all">All payment methods</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            borderTop: "1px solid #f1f5f9",
            paddingTop: "14px",
          }}
        >
          <span style={{ color: "#475569", fontWeight: 700 }}>
            {dateRangeLabel}
          </span>
          <span style={{ color: "#64748b", fontSize: "14px" }}>
            {filteredSales.length} matching transaction{filteredSales.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {filteredSales.length ? (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <th style={{ padding: "12px" }}>Sale #</th>
                  <th style={{ padding: "12px" }}>Customer</th>
                  <th style={{ padding: "12px" }}>Items</th>
                  <th style={{ padding: "12px" }}>Payment</th>
                  <th style={{ padding: "12px" }}>Paid</th>
                  <th style={{ padding: "12px" }}>Balance</th>
                  <th style={{ padding: "12px" }}>Linked Orders</th>
                  <th style={{ padding: "12px" }}>Date</th>
                  <th style={{ padding: "12px" }}>Receipt</th>
                </tr>
              </thead>

              <tbody>
                {filteredSales.map((sale) => (
                  <tr
                    key={sale.sale_number}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      {sale.sale_number}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 700 }}>
                        {sale.customer_name || "Walk-in Customer"}
                      </div>
                      {sale.notes ? (
                        <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                          {sale.notes}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div>{(sale.items || []).length} items</div>
                      <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                        {(sale.items || [])
                          .slice(0, 2)
                          .map((item) => item.name)
                          .filter(Boolean)
                          .join(", ") || "No items recorded"}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div>{sale.payment_method || "Not recorded"}</div>
                      <div
                        style={{
                          color:
                            sale.payment_status === "Paid" ? "#166534" : "#b45309",
                          fontWeight: 700,
                          marginTop: "4px",
                        }}
                      >
                        {sale.payment_status}
                      </div>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      {currency(sale.amount_paid ?? sale.total)}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        fontWeight: 700,
                        color: Number(sale.balance_due || 0) > 0 ? "#b45309" : "#166534",
                      }}
                    >
                      {currency(sale.balance_due)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {(sale.production_order_numbers || []).length ? (
                        <div style={{ display: "grid", gap: "4px" }}>
                          {sale.production_order_numbers.map((orderNumber) => (
                            <Link key={orderNumber} to={`/admin/orders/${orderNumber}`}>
                              {orderNumber}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#64748b" }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: "12px", color: "#64748b" }}>
                      {formatDateTime(sale.created_at)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <Link to={`/admin/sales/receipt/${sale.sale_number}`} style={{ fontWeight: 700 }}>
                        Open receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "28px 24px",
              display: "grid",
              gap: "10px",
              color: "#64748b",
            }}
          >
            <strong style={{ color: "#0f172a" }}>
              {sales.length ? "No sales match this lookup window." : "No front-counter sales recorded yet."}
            </strong>
            <span>
              {sales.length
                ? "Adjust the time window or filters to widen the history view."
                : "Completed counter transactions will appear here once the front counter starts recording sales."}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
