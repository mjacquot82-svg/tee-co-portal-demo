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
        minHeight: "118px",
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: "20px" }}>{title}</h3>
      <p style={{ margin: 0, color: primary ? "#e7e5e4" : "#64748b", lineHeight: 1.5 }}>
        {description}
      </p>
    </Link>
  );
}

function LauncherSection({ title, description, children }) {
  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: "24px",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b" }}>{description}</p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "14px",
        }}
      >
        {children}
      </div>
    </section>
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
          Use this as the home screen for counter sales, production work, customers, and products.
        </p>
      </div>

      <Link
        to="/admin/sales/new"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "18px",
          alignItems: "center",
          textDecoration: "none",
          background: "#171717",
          color: "#ffffff",
          borderRadius: "24px",
          padding: "26px",
          boxShadow: "0 18px 45px rgba(23,23,23,0.18)",
          marginBottom: "24px",
        }}
      >
        <div>
          <p style={{ margin: "0 0 8px", color: "#d6d3d1", fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Counter Staff Shortcut
          </p>
          <h2 style={{ margin: "0 0 8px", fontSize: "32px", lineHeight: 1.1 }}>Start a New Quick Sale</h2>
          <p style={{ margin: 0, color: "#e7e5e4", fontSize: "16px", lineHeight: 1.5 }}>
            One-click entry for walk-in customers, stocked products, payment method, and receipt-style sale records.
          </p>
        </div>
        <div
          style={{
            background: "#ffffff",
            color: "#171717",
            borderRadius: "999px",
            padding: "14px 20px",
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          New Quick Sale →
        </div>
      </Link>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard title="Counter Sales" value="POS" helper="Walk-in purchases and sale history." />
        <StatCard title="Production" value="Jobs" helper="Custom orders and shop queue." />
        <StatCard title="Customers" value="CRM" helper="Profiles, repeat orders, and contacts." />
        <StatCard title="Products" value="Catalog" helper="Items used for sales and production." />
      </div>

      <LauncherSection
        title="Counter Sales"
        description="Use these for walk-in purchases and reviewing completed counter transactions."
      >
        <ActionCard
          to="/admin/sales/new"
          title="New Quick Sale"
          description="Sell stocked items at the counter. Customer name is optional."
          primary
        />
        <ActionCard
          to="/admin/sales"
          title="Sales History"
          description="Review completed counter sales, totals, payment methods, and walk-in transactions."
        />
      </LauncherSection>

      <LauncherSection
        title="Production"
        description="Use these for custom decorated orders and work that needs the shop."
      >
        <ActionCard
          to="/admin/orders/new"
          title="New Production Order"
          description="Create a decorated garment or custom job that needs approval, deposit, and production."
          primary
        />
        <ActionCard
          to="/admin/orders"
          title="Production Orders"
          description="Track quotes, approvals, deposits, production status, and pickup readiness."
        />
        <ActionCard
          to="/admin/queue"
          title="Production Queue"
          description="See approved jobs that are ready for shop work, printing, embroidery, or pickup."
        />
      </LauncherSection>

      <LauncherSection
        title="Admin Records"
        description="Use these less often for customer records and product setup."
      >
        <ActionCard
          to="/admin/customers"
          title="Customers"
          description="Find customer profiles, repeat orders, contact details, and customer history."
        />
        <ActionCard
          to="/admin/products"
          title="Products"
          description="Manage the catalog used for both quick sales and production orders."
        />
      </LauncherSection>
    </div>
  );
}
