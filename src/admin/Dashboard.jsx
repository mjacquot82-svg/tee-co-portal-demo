import { Link } from "react-router-dom";
import { getStoredOrders } from "../lib/ordersStore";
import { getStoredQuickSales } from "../lib/salesStore";

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function isToday(isoDate) {
  if (!isoDate) return false;
  const date = new Date(isoDate);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isDueSoon(dateValue) {
  if (!dateValue) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${dateValue}T00:00:00`);
  const fiveDaysFromNow = new Date(today);
  fiveDaysFromNow.setDate(today.getDate() + 5);

  return dueDate >= today && dueDate <= fiveDaysFromNow;
}

function SnapshotCard({ title, value, helper, to, tone = "neutral" }) {
  const Wrapper = to ? Link : "div";
  const hasAttention = Number(value || 0) > 0;
  const toneStyles = {
    neutral: { background: "#ffffff", border: "#e7e5e4", accent: "#64748b" },
    sales: { background: hasAttention ? "#f0fdf4" : "#ffffff", border: hasAttention ? "#bbf7d0" : "#e7e5e4", accent: "#15803d" },
    approval: { background: hasAttention ? "#fffbeb" : "#ffffff", border: hasAttention ? "#fde68a" : "#e7e5e4", accent: "#b45309" },
    deposit: { background: hasAttention ? "#fff7ed" : "#ffffff", border: hasAttention ? "#fed7aa" : "#e7e5e4", accent: "#c2410c" },
    production: { background: hasAttention ? "#eff6ff" : "#ffffff", border: hasAttention ? "#bfdbfe" : "#e7e5e4", accent: "#1d4ed8" },
    urgent: { background: hasAttention ? "#fef2f2" : "#ffffff", border: hasAttention ? "#fecaca" : "#e7e5e4", accent: "#b91c1c" },
    pickup: { background: hasAttention ? "#ecfdf5" : "#ffffff", border: hasAttention ? "#a7f3d0" : "#e7e5e4", accent: "#047857" },
  };
  const styles = toneStyles[tone] || toneStyles.neutral;

  return (
    <Wrapper
      to={to}
      style={{
        display: "block",
        textDecoration: "none",
        background: styles.background,
        borderRadius: "18px",
        padding: "20px",
        boxShadow: hasAttention ? "0 10px 24px rgba(15,23,42,0.08)" : "0 1px 3px rgba(0,0,0,0.08)",
        border: `1px solid ${styles.border}`,
        cursor: to ? "pointer" : "default",
      }}
    >
      <p style={{ margin: 0, color: styles.accent, fontWeight: 800, fontSize: "13px" }}>{title}</p>
      <h2 style={{ margin: "8px 0 4px", fontSize: "32px", letterSpacing: "-0.03em", color: "#171717" }}>{value}</h2>
      {helper && <p style={{ margin: 0, color: "#78716c", fontSize: "14px", lineHeight: 1.4 }}>{helper}</p>}
    </Wrapper>
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
  const orders = getStoredOrders();
  const quickSales = getStoredQuickSales();

  const todaysSales = quickSales.filter((sale) => isToday(sale.created_at));
  const todaysSalesTotal = todaysSales.reduce((total, sale) => total + Number(sale.total || 0), 0);

  const waitingApproval = orders.filter((order) =>
    ["Quote Sent", "Mockup Sent", "Awaiting Approval", "Awaiting Customer Approval"].includes(order.status)
  ).length;

  const depositsNeeded = orders.filter((order) =>
    ["Approved", "Awaiting Deposit"].includes(order.status) && order.deposit?.status !== "paid"
  ).length;

  const readyForShop = orders.filter((order) =>
    ["Approved", "Deposit Paid", "Ready for Production", "In Production"].includes(order.status) || order.production_ready
  ).length;

  const dueSoon = orders.filter((order) =>
    isDueSoon(order.due_date) && !["Completed", "Cancelled"].includes(order.status)
  ).length;

  const pickupReady = orders.filter((order) =>
    ["Ready for Pickup", "Pickup Ready", "Completed"].includes(order.status)
  ).length;

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

      <section style={{ marginBottom: "24px" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>Shop Snapshot</h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            Quick view of today’s counter activity and production workload.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
          }}
        >
          <SnapshotCard title="Today’s Sales" value={currency(todaysSalesTotal)} helper={`${todaysSales.length} counter sale${todaysSales.length === 1 ? "" : "s"} today`} to="/admin/sales" tone="sales" />
          <SnapshotCard title="Waiting Approval" value={waitingApproval} helper="Click to review jobs waiting on customer approval." to="/admin/orders?filter=approval" tone="approval" />
          <SnapshotCard title="Deposits Needed" value={depositsNeeded} helper="Approved jobs waiting for deposit payment." to="/admin/orders?filter=deposit-required" tone="deposit" />
          <SnapshotCard title="Ready for Shop" value={readyForShop} helper="Click to review production-ready jobs." to="/admin/queue" tone="production" />
          <SnapshotCard title="Due Soon" value={dueSoon} helper="Open jobs needed within the next 5 days." to="/admin/orders?filter=due-soon" tone="urgent" />
          <SnapshotCard title="Pickup Ready" value={pickupReady} helper="Click to review pickup-ready jobs." to="/admin/orders?filter=pickup-ready" tone="pickup" />
        </div>
      </section>

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
        description="Use these for sales history, customer records, and product setup."
      >
        <ActionCard
          to="/admin/sales"
          title="Sales History"
          description="Review completed counter sales, totals, payment methods, and walk-in transactions."
        />
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
