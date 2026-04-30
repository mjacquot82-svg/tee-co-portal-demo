import { Link } from "react-router-dom";

function StatCard({ title, value, helper }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "22px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        border: "1px solid #f1f5f9",
      }}
    >
      <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>{title}</p>
      <h2 style={{ margin: "8px 0 4px", fontSize: "32px" }}>{value}</h2>
      {helper && <p style={{ margin: 0, color: "#78716c", fontSize: "14px" }}>{helper}</p>}
    </div>
  );
}

function ActionCard({ to, title, description, primary }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        textDecoration: "none",
        background: primary ? "#171717" : "#ffffff",
        color: primary ? "#ffffff" : "#171717",
        border: primary ? "1px solid #171717" : "1px solid #e2e8f0",
        borderRadius: "18px",
        padding: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: "20px" }}>{title}</h3>
      <p style={{ margin: 0, color: primary ? "#e7e5e4" : "#64748b", lineHeight: 1.5 }}>
        {description}
      </p>
    </Link>
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
        <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Staff Workspace
        </p>
        <h1 style={{ margin: "6px 0 8px", fontSize: "34px" }}>Central Operations</h1>
        <p style={{ color: "#475569", margin: 0 }}>
          Start a counter sale, create a production order, or check what needs attention in the shop.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard title="Quick Sales" value="New" helper="Use for walk-in purchases." />
        <StatCard title="Production Orders" value="Active" helper="Custom work and decorated items." />
        <StatCard title="Production Queue" value="4" helper="Jobs currently needing shop work." />
        <StatCard title="Ready for Pickup" value="1" helper="Completed orders waiting." />
      </div>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Start Work</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "14px",
          }}
        >
          <ActionCard
            to="/admin/sales/new"
            title="Quick Sale"
            description="Sell stocked items at the counter without creating a production job. Customer name is optional."
            primary
          />
          <ActionCard
            to="/admin/orders/new"
            title="New Production Order"
            description="Create a decorated garment or custom job that needs production work."
          />
        </div>
      </section>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Manage</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          <ActionCard
            to="/admin/orders"
            title="Production Orders"
            description="View customer orders, approvals, deposits, and production status."
          />
          <ActionCard
            to="/admin/queue"
            title="Production Queue"
            description="See what the shop needs to make, decorate, finish, or prepare for pickup."
          />
          <ActionCard
            to="/admin/customers"
            title="Customers"
            description="Find customer profiles, repeat orders, and saved contact details."
          />
          <ActionCard
            to="/admin/products"
            title="Products"
            description="Manage the product catalog used for production orders and quick sales."
          />
        </div>
      </section>
    </div>
  );
}