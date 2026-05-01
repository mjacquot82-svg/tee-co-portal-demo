import { Link, useParams } from "react-router-dom";
import { findStoredQuickSale } from "../lib/salesStore";

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export default function SaleReceipt() {
  const { saleNumber } = useParams();
  const sale = findStoredQuickSale(saleNumber);

  if (!sale) {
    return (
      <div style={{ maxWidth: "720px", margin: "40px auto", padding: "24px" }}>
        <h1>Receipt not found</h1>
        <p>This sale could not be found in the current browser storage.</p>
        <Link to="/admin/sales">Back to Sales History</Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        @media print {
          body { background: #ffffff !important; }
          .no-print { display: none !important; }
          .receipt-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "18px",
          flexWrap: "wrap",
        }}
      >
        <Link
          to="/admin/sales"
          style={{ color: "#475569", fontWeight: 700, textDecoration: "none" }}
        >
          ← Back to Sales History
        </Link>

        <button
          onClick={() => window.print()}
          style={{
            background: "#171717",
            color: "#ffffff",
            border: "none",
            borderRadius: "12px",
            padding: "12px 16px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Print Receipt
        </button>
      </div>

      <section
        className="receipt-card"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          padding: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "18px", marginBottom: "18px" }}>
          <h1 style={{ margin: 0, fontSize: "28px" }}>Tee & Co Ltd.</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Customer Receipt</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px", fontSize: "14px" }}>
          <div>
            <strong>Sale #</strong>
            <p style={{ margin: "4px 0 0" }}>{sale.sale_number}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>Date</strong>
            <p style={{ margin: "4px 0 0" }}>{formatDate(sale.created_at)}</p>
          </div>
          <div>
            <strong>Customer</strong>
            <p style={{ margin: "4px 0 0" }}>{sale.customer_name || "Walk-in Customer"}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>Payment</strong>
            <p style={{ margin: "4px 0 0" }}>{sale.payment_method} • {sale.payment_status}</p>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "18px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
              <th style={{ padding: "10px 0" }}>Item</th>
              <th style={{ padding: "10px 0", textAlign: "center" }}>Qty</th>
              <th style={{ padding: "10px 0", textAlign: "right" }}>Price</th>
              <th style={{ padding: "10px 0", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 0" }}>
                  <strong>{item.name}</strong>
                  <div style={{ color: "#64748b", fontSize: "13px", marginTop: "2px" }}>
                    {[item.color, item.size].filter(Boolean).join(" • ")}
                  </div>
                </td>
                <td style={{ padding: "10px 0", textAlign: "center" }}>{item.qty}</td>
                <td style={{ padding: "10px 0", textAlign: "right" }}>{currency(item.unit_price)}</td>
                <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>{currency(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "grid", gap: "8px", maxWidth: "280px", marginLeft: "auto", fontSize: "15px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Subtotal</span>
            <strong>{currency(sale.subtotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Tax</span>
            <strong>{currency(sale.tax_total)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "10px", fontSize: "20px" }}>
            <span>Total</span>
            <strong>{currency(sale.total)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Paid</span>
            <strong>{currency(sale.amount_paid ?? sale.total)}</strong>
          </div>
          {Number(sale.balance_due || 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Balance Due</span>
              <strong>{currency(sale.balance_due)}</strong>
            </div>
          )}
        </div>

        {sale.notes && (
          <div style={{ marginTop: "22px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
            <strong>Notes</strong>
            <p style={{ margin: "6px 0 0", color: "#475569" }}>{sale.notes}</p>
          </div>
        )}

        <p style={{ textAlign: "center", margin: "26px 0 0", color: "#64748b", fontSize: "14px" }}>
          Thank you for shopping with Tee & Co Ltd.
        </p>
      </section>
    </div>
  );
}
