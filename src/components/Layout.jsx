import { Link, Outlet, useLocation } from "react-router-dom";
import logo from "../assets/icon-512.png";
import { getStoredOrders } from "../lib/ordersStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "currentColor" }}>
      <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.56c0-.93.26-1.56 1.6-1.56H16.8V4.14c-.3-.04-1.34-.14-2.56-.14-2.54 0-4.28 1.55-4.28 4.28v2.2H7.08v3.2h2.88V22h3.54Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{
        width: "18px",
        height: "18px",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
      }}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
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

function getSidebarCounts() {
  const orders = getStoredOrders();

  const needsAttention = orders.filter((order) =>
    ["quote sent", "mockup sent", "awaiting approval", "awaiting customer approval", "approved", "awaiting deposit"].includes(normalizeStatus(order.status)) && order.deposit?.status !== "paid"
  ).length;

  const productionReady = orders.filter((order) =>
    ["approved", "paid", "deposit paid", "ready for production", "in production", "printing", "embroidery", "production"].includes(normalizeStatus(order.status)) || order.production_ready
  ).length;

  const dueSoon = orders.filter((order) =>
    isDueSoon(order.due_date) && !["completed", "cancelled"].includes(normalizeStatus(order.status))
  ).length;

  return {
    productionOrders: needsAttention + dueSoon,
    productionQueue: productionReady,
  };
}

function getAdminSections(role) {
  const isOwner = role === "Owner";

  return [
    {
      title: "Counter",
      links: [{ to: "/admin/sales/new", label: "New Quick Sale" }],
    },
    {
      title: "Production",
      links: [
        { to: "/admin/orders/new", label: "New Production Order" },
        { to: "/admin/orders", label: "Production Orders", badgeKey: "productionOrders" },
        { to: "/admin/queue", label: "Production Queue", badgeKey: "productionQueue" },
      ],
    },
    {
      title: "Records",
      links: [
        { to: "/admin/sales", label: "Sales History" },
        { to: "/admin/customers", label: "Customers" },
        ...(isOwner ? [{ to: "/admin/products", label: "Products" }] : []),
        ...(isOwner ? [{ to: "/admin/staff-users", label: "Staff Users" }] : []),
      ],
    },
  ];
}

function getActiveSidebarLink(pathname) {
  if (pathname === "/admin") return "/admin";
  if (pathname === "/admin/sales/new") return "/admin/sales/new";
  if (pathname === "/admin/sales") return "/admin/sales";
  if (pathname === "/admin/orders/new") return "/admin/orders/new";
  if (pathname === "/admin/orders" || pathname.startsWith("/admin/orders/")) return "/admin/orders";
  if (pathname === "/admin/queue") return "/admin/queue";
  if (pathname.startsWith("/admin/customers")) return "/admin/customers";
  if (pathname.startsWith("/admin/products")) return "/admin/products";
  if (pathname.startsWith("/admin/staff-users")) return "/admin/staff-users";
  return "";
}

function WorkspaceBadge({ isAdmin }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        borderRadius: "999px",
        padding: "7px 11px",
        background: isAdmin ? "#171717" : "#f8fafc",
        color: isAdmin ? "#ffffff" : "#292524",
        border: isAdmin ? "1px solid #171717" : "1px solid #d6d3d1",
        fontSize: "12px",
        fontWeight: 800,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "999px",
          background: isAdmin ? "#22c55e" : "#94a3b8",
        }}
      />
      {isAdmin ? "Staff Workspace" : "Customer Portal"}
    </span>
  );
}

function ActiveStaffBadge({ staffUser }) {
  if (!staffUser) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        borderRadius: "999px",
        padding: "7px 11px",
        background: "#ecfdf5",
        color: "#047857",
        border: "1px solid #a7f3d0",
        fontSize: "12px",
        fontWeight: 900,
      }}
    >
      Logged in as: {staffUser.name} ({staffUser.role})
    </span>
  );
}

function AttentionBadge({ count, active }) {
  if (!count) return null;

  return (
    <span
      style={{
        minWidth: "22px",
        height: "22px",
        padding: "0 7px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "#ffffff" : "#fff7ed",
        color: active ? "#171717" : "#c2410c",
        border: active ? "none" : "1px solid #fed7aa",
        fontSize: "12px",
        fontWeight: 900,
      }}
    >
      {count}
    </span>
  );
}

function AdminSidebar({ pathname, staffUser }) {
  const badgeCounts = getSidebarCounts();
  const activeLink = getActiveSidebarLink(pathname);
  const role = staffUser?.role || "Staff";
  const adminSections = getAdminSections(role);

  return (
    <aside
      style={{
        width: "245px",
        flex: "0 0 245px",
        alignSelf: "start",
        position: "sticky",
        top: "116px",
        background: "#ffffff",
        border: "1px solid #e7e5e4",
        borderRadius: "20px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <Link
        to="/admin"
        style={{
          display: "block",
          textDecoration: "none",
          borderRadius: "14px",
          padding: "12px",
          marginBottom: "12px",
          background: activeLink === "/admin" ? "#171717" : "#f8fafc",
          color: activeLink === "/admin" ? "#ffffff" : "#171717",
          fontWeight: 800,
        }}
      >
        Dashboard
      </Link>

      {adminSections.map((section) => (
        <div key={section.title} style={{ marginTop: "14px" }}>
          <p
            style={{
              margin: "0 0 7px",
              color: "#78716c",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {section.title}
          </p>
          <div style={{ display: "grid", gap: "6px" }}>
            {section.links.map((link) => {
              const active = activeLink === link.to;
              const badgeCount = link.badgeKey ? badgeCounts[link.badgeKey] : 0;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    textDecoration: "none",
                    borderRadius: "12px",
                    padding: "10px 11px",
                    background: active ? "#292524" : "#ffffff",
                    color: active ? "#ffffff" : "#292524",
                    border: active ? "1px solid #292524" : "1px solid #f1f5f9",
                    fontWeight: active ? 800 : 650,
                    fontSize: "14px",
                  }}
                >
                  <span>{link.label}</span>
                  <AttentionBadge count={badgeCount} active={active} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <Link
        to="/"
        style={{
          display: "block",
          marginTop: "18px",
          padding: "10px 11px",
          borderRadius: "12px",
          border: "1px solid #d6d3d1",
          color: "#171717",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: "14px",
        }}
      >
        Public Site
      </Link>
    </aside>
  );
}

export default function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isHome = location.pathname === "/";
  const activeStaffUser = isAdmin ? getActiveStaffUser() : null;

  const customerLinks = [
    { to: "/", label: "Home" },
    { to: "/login", label: "Login" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8f5f1 0%, #f8fafc 160px, #f8fafc 100%)",
        color: "#171717",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          background: "rgba(255,255,255,0.92)",
          borderBottom: "1px solid #e7e5e4",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: isAdmin ? "1360px" : "1100px",
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <img src={logo} alt="Tee & Co Ltd." style={{ height: "80px", objectFit: "contain" }} />
            <span style={{ fontWeight: 700, fontSize: "22px", letterSpacing: "-0.02em", color: "#171717" }}>
              Tee & Co Ltd.
            </span>
            <WorkspaceBadge isAdmin={isAdmin} />
            {isAdmin && <ActiveStaffBadge staffUser={activeStaffUser} />}
          </div>

          {!isAdmin && (
            <nav style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
              {customerLinks.map((link) => {
                const active = location.pathname === link.to || (link.to !== "/" && location.pathname.startsWith(link.to));
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    style={{
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: active ? "1px solid #171717" : "1px solid #d6d3d1",
                      background: active ? "#171717" : "#ffffff",
                      color: active ? "#ffffff" : "#171717",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {isHome && (
                <>
                  <a href="https://www.facebook.com/login/" target="_blank" rel="noreferrer" aria-label="Open Facebook sign in" style={{ width: "36px", height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#ffffff", color: "#1877f2", border: "1px solid #e7e5e4" }}>
                    <FacebookIcon />
                  </a>
                  <a href="https://www.instagram.com/accounts/login/" target="_blank" rel="noreferrer" aria-label="Open Instagram log in" style={{ width: "36px", height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#ffffff", color: "#e1306c", border: "1px solid #e7e5e4" }}>
                    <InstagramIcon />
                  </a>
                </>
              )}
            </nav>
          )}
        </div>
      </header>

      <div style={{ maxWidth: "1360px", margin: "8px auto 0 auto", padding: "0 14px" }}>
        <div
          style={{
            background: isAdmin ? "#1c1917" : "#292524",
            color: "#fafaf9",
            borderRadius: "14px",
            padding: "10px 14px",
            boxShadow: "0 6px 16px rgba(28,25,23,0.12)",
          }}
        >
          <p style={{ margin: 0, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#d6d3d1" }}>
            {isAdmin ? "Staff Workspace" : "Customer Portal"}
          </p>
          <h1 style={{ margin: "2px 0", fontSize: "16px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {isAdmin ? "Manage counter sales, production orders, and customer records" : "Custom apparel ordering made simple"}
          </h1>
        </div>
      </div>

      {isAdmin ? (
        <div
          style={{
            maxWidth: "1360px",
            margin: "0 auto",
            padding: "14px",
            display: "flex",
            gap: "18px",
            alignItems: "flex-start",
          }}
        >
          <AdminSidebar pathname={location.pathname} staffUser={activeStaffUser} />
          <main style={{ flex: 1, minWidth: 0, paddingBottom: "26px" }}>
            <Outlet />
          </main>
        </div>
      ) : (
        <main style={{ padding: "14px 0 26px 0" }}>
          <Outlet />
        </main>
      )}
    </div>
  );
}
