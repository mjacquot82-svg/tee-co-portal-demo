import { Link } from "react-router-dom";
import { getStoredQuickSales } from "../lib/salesStore";

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function Sales() {
  const sales = getStoredQuickSales();

  return (
    <div
      style={{
        maxWidth: "1200px",
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
            Counter Sales
          </p>
          <h1 style={{ margin: "6px 0 8px" }}>Sales History</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Review completed walk‑in sales and counter transactions.
          </p>
        </div>

        <Link
          to="/admin/sales/new"
          style={{
            background: "#171717",
            color: "#ffffff",
            textDecoration: "none",
            borderRadius: "12px",
            padding: "12px 16px",
            fontWeight: 700,
          }}
        >
          New Quick Sale
        </Link>
      </div>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {sales.length ? (
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
                <th style={{ padding: "12px" }}>Payment</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px" }}>Total</th>
                <th style={{ padding: "12px" }}>Date</th>
              </tr>
            </thead>

            <tbody>
              {sales.map((sale) => (
                <tr
                  key={sale.sale_number}
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                >
                  <td style={{ padding: "12px", fontWeight: 700 }}>
                    {sale.sale_number}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {sale.customer_name}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {sale.payment_method}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: 700,
                      color:
                        sale.payment_status === "Paid"
                          ? "#166534"
                          : "#b45309",
                    }}
                  >
                    {sale.payment_status}
                  </td>
                  <td style={{ padding: "12px", fontWeight: 700 }}>
                    {currency(sale.total)}
                  </td>
                  <td style={{ padding: "12px", color: "#64748b" }}>
                    {new Date(sale.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: "20px", color: "#64748b" }}>
            No quick sales recorded yet.
          </div>
        )}
      </section>
    </div>
  );
}
