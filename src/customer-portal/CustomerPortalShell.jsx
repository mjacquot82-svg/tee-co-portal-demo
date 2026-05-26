import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import {
  getActiveCustomerSession,
  subscribeToActiveCustomerSession,
} from "../lib/customerSessionStore";
import { ensureCustomerProfile } from "../lib/customerProfileStore";
import { getUserInitials } from "../utils/getUserInitials";
import {
  ensureOperationalAuthInitialized,
  isOperationalAuthLoading,
  signOutOperationalWorkspace,
  subscribeToOperationalAuth,
} from "../lib/operationalAuthStore";

const portalLinks = [
  { to: "/portal/request-order", label: "Start New Order" },
  { to: "/portal/orders", label: "My Orders" },
  { to: "/portal/quotes", label: "Quotes" },
  { to: "/portal/invoices", label: "Invoices" },
  { to: "/portal/account", label: "Account" },
];

function CustomerPortalLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top, rgba(191, 219, 254, 0.28), transparent 34%), linear-gradient(180deg, #f8fafc 0%, #eef6f5 100%)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          borderRadius: "28px",
          border: "1px solid #dbe4ee",
          background: "rgba(255,255,255,0.92)",
          padding: "28px",
          boxShadow: "0 20px 48px rgba(15, 23, 42, 0.08)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#0f766e",
          }}
        >
          Tee & Co Portal
        </p>
        <h1 style={{ margin: 0, color: "#0f172a", fontSize: "28px" }}>Restoring session</h1>
        <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.6 }}>
          Confirming your account access and loading your portal.
        </p>
      </div>
    </div>
  );
}

export default function CustomerPortalShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [customerSession, setCustomerSession] = useState(() =>
    getActiveCustomerSession()
  );
  const [authLoading, setAuthLoading] = useState(() => isOperationalAuthLoading());

  useEffect(() => {
    void ensureOperationalAuthInitialized().then((snapshot) => {
      setAuthLoading(snapshot.isLoading);
      setCustomerSession(getActiveCustomerSession());
    });

    const unsubscribeAuth = subscribeToOperationalAuth((snapshot) => {
      setAuthLoading(snapshot.isLoading);
      setCustomerSession(getActiveCustomerSession());
    });
    const unsubscribeCustomer = subscribeToActiveCustomerSession((nextSession) => {
      setCustomerSession(nextSession);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeCustomer();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!customerSession) {
      navigate(`/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`, {
        replace: true,
      });
      return;
    }

    ensureCustomerProfile(customerSession).catch((error) => {
      console.error("Unable to ensure customer profile", error);
    });
  }, [authLoading, customerSession, location.pathname, location.search, navigate]);

  async function handleSignOut() {
    await signOutOperationalWorkspace();
    clearAllAuthSessions("customer-portal-logout");
    navigate("/login", { replace: true });
  }

  if (authLoading) {
    return <CustomerPortalLoading />;
  }

  if (!customerSession) {
    return null;
  }

  const initials = getUserInitials(customerSession.displayName);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(191, 219, 254, 0.3), transparent 30%), radial-gradient(circle at bottom right, rgba(167, 243, 208, 0.28), transparent 30%), linear-gradient(180deg, #f8fafc 0%, #f0fdfa 100%)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(18px)",
          background: "rgba(248, 250, 252, 0.86)",
          borderBottom: "1px solid rgba(203, 213, 225, 0.8)",
        }}
      >
        <div
          style={{
            maxWidth: "1180px",
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#0f766e",
              }}
            >
              Tee & Co
            </p>
            <strong style={{ color: "#0f172a", fontSize: "24px", lineHeight: 1.1 }}>
              Customer Portal
            </strong>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <NavLink
              to="/portal/request-order"
              style={({ isActive }) => ({
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "44px",
                borderRadius: "999px",
                padding: "11px 18px",
                textDecoration: "none",
                fontWeight: 800,
                background: isActive ? "#115e59" : "#0f766e",
                color: "#ffffff",
                boxShadow: "0 12px 24px rgba(15, 118, 110, 0.18)",
              })}
            >
              Start New Order
            </NavLink>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "999px",
                background: "#ccfbf1",
                color: "#115e59",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: "160px" }}>
              <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>
                {customerSession.displayName}
              </p>
              <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "13px" }}>
                {customerSession.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: "999px",
                padding: "11px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "28px 24px 48px" }}>
        <div
          className="customer-portal-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "240px minmax(0, 1fr)",
            gap: "24px",
            alignItems: "start",
          }}
        >
          <aside
            className="customer-portal-sidebar"
            style={{
              position: "sticky",
              top: "108px",
              borderRadius: "24px",
              border: "1px solid #dbe4ee",
              background: "rgba(255,255,255,0.9)",
              boxShadow: "0 18px 42px rgba(15, 23, 42, 0.06)",
              padding: "18px",
              display: "grid",
              gap: "8px",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Primary Action
            </p>

            <NavLink
              to="/portal/request-order"
              style={({ isActive }) => ({
                textDecoration: "none",
                borderRadius: "18px",
                padding: "14px 16px",
                color: "#ffffff",
                background: isActive
                  ? "linear-gradient(135deg, #115e59 0%, #0f766e 100%)"
                  : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: "0 16px 28px rgba(15, 118, 110, 0.16)",
                fontWeight: 800,
              })}
            >
              Start New Order
            </NavLink>

            <p
              style={{
                margin: "8px 0 4px",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Portal Sections
            </p>

            {portalLinks.map((link) => (
              link.to === "/portal/request-order" ? null : (
              <NavLink
                key={link.to}
                to={link.to}
                style={({ isActive }) => ({
                  textDecoration: "none",
                  borderRadius: "16px",
                  padding: "12px 14px",
                  color: isActive ? "#0f766e" : "#0f172a",
                  background: isActive ? "#ecfdf5" : "#ffffff",
                  border: isActive ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                  fontWeight: isActive ? 800 : 700,
                })}
              >
                {link.label}
              </NavLink>
              )
            ))}
          </aside>

          <div style={{ minWidth: 0 }}>
            <Outlet context={{ customerSession }} />
          </div>
        </div>
      </main>
    </div>
  );
}
