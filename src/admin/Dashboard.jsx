import { Link } from "react-router-dom";

function StatCard({ title, value }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ margin: 0, color: "#64748b" }}>{title}</p>
      <h2 style={{ marginTop: "8px", fontSize: "32px" }}>{value}</h2>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0 }}>Shop Dashboard</h1>
        <p style={{ color: "#475569" }}>
          Monitor incoming requests and move jobs through production.
        </p>
      </div>

      {/* stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard title="New Requests" value="3" />
        <StatCard title="Awaiting Deposit" value="2" />
        <StatCard title="In Production" value="4" />
        <StatCard title="Ready for Pickup" value="1" />
      </div>

      {/* quick actions */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "16px",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/admin/orders"
            style={{
              background: "#0f172a",
              color: "#fff",
              padding: "14px 18px",
              borderRadius: "12px",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            View Orders
          </Link>

          <button
            style={{
              border: "1px solid #cbd5e1",
              background: "#fff",
              padding: "14px 18px",
              borderRadius: "12px",
              cursor: "pointer",
            }}
          >
            Send Payment Link
          </button>

          <button
            style={{
              border: "1px solid #cbd5e1",
              background: "#fff",
              padding: "14px 18px",
              borderRadius: "12px",
              cursor: "pointer",
            }}
          >
            Create Manual Order
          </button>
        </div>
      </div>
    </div>
  );
}