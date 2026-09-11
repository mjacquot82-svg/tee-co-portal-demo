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
import {
  isPortalOrderingPath,
  isPortalOrderingWorkflowPath,
  PORTAL_ORDER_CATALOG_PATH,
  START_NEW_PORTAL_ORDER_STATE,
} from "./customerPortalStartOrderRoute";
import { usePaymentReconciliationRefresh } from "../lib/usePaymentReconciliationRefresh";

const LOGO_SRC = "/tee&co512x512.png";

const portalLinks = [
  { to: PORTAL_ORDER_CATALOG_PATH, label: "Start New Order" },
  { to: "/portal/orders", label: "My Orders" },
  { to: "/portal/payments", label: "Payments" },
  { to: "/portal/quotes", label: "Quotes" },
  { to: "/portal/invoices", label: "Invoices" },
  { to: "/portal/account", label: "Account" },
];

const mobileNavLinks = [
  { to: PORTAL_ORDER_CATALOG_PATH, label: "Shop", match: "shop" },
  { to: "/portal/orders", label: "Orders", match: "orders" },
  { to: "/portal/payments", label: "Payments", match: "payments" },
  { to: "/portal/account", label: "Account", match: "account" },
];

function isMobileNavActive(pathname, match) {
  const path = String(pathname || "");
  if (match === "shop") {
    return (
      isPortalOrderingPath(path) ||
      path === "/portal/request-order" ||
      path === "/portal/order-submitted"
    );
  }
  if (match === "orders") {
    return path === "/portal/orders" || path.startsWith("/portal/orders/");
  }
  if (match === "payments") {
    return path === "/portal/payments" || path.startsWith("/portal/payments/");
  }
  if (match === "account") {
    return path === "/portal/account" || path === "/portal/quotes" || path === "/portal/invoices";
  }
  return false;
}

function CustomerPortalLoading() {
  return (
    <div className="customer-portal-app customer-portal-loading">
      <div className="customer-portal-loading-card">
        <img
          className="customer-portal-brand-mark"
          src={LOGO_SRC}
          alt=""
          width="56"
          height="56"
          decoding="async"
        />
        <p className="customer-portal-brand-kicker">Tee & Co</p>
        <h1>Signing you in</h1>
        <p>Confirming your account and loading your shop.</p>
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
  usePaymentReconciliationRefresh(Boolean(customerSession));

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
  const isOrderingWorkflow = isPortalOrderingWorkflowPath(location.pathname);
  const isOrderingCatalog = isPortalOrderingPath(location.pathname);

  return (
    <div className="customer-portal-app">
      <header className="customer-portal-header">
        <div className="customer-portal-header-inner">
          <div className="customer-portal-brand-block">
            <img
              className="customer-portal-brand-mark"
              src={LOGO_SRC}
              alt="Tee & Co"
              width="40"
              height="40"
              decoding="async"
            />
            <div className="customer-portal-brand-copy">
              <p className="customer-portal-brand-kicker">Tee & Co</p>
              <strong className="customer-portal-brand-title">Customer Portal</strong>
            </div>
          </div>

          <div className="customer-portal-header-actions">
            <NavLink
              className="customer-portal-primary-action"
              to={isOrderingWorkflow ? "/portal/orders" : PORTAL_ORDER_CATALOG_PATH}
              state={isOrderingWorkflow ? undefined : START_NEW_PORTAL_ORDER_STATE}
            >
              {isOrderingWorkflow ? "← Back to Account" : "Start New Order"}
            </NavLink>

            <div className="customer-portal-identity">
              <div className="customer-portal-avatar" aria-hidden="true">
                {initials}
              </div>
              <div className="customer-portal-identity-text">
                <p className="customer-portal-identity-name">{customerSession.displayName}</p>
                <p className="customer-portal-identity-email">{customerSession.email}</p>
              </div>
            </div>

            <button
              type="button"
              className="customer-portal-signout"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="customer-portal-workspace">
        <div className="customer-portal-layout">
          <aside className="customer-portal-sidebar" aria-label="Portal sections">
            <p className="customer-portal-sidebar-label">Primary Action</p>

            <NavLink
              className="customer-portal-section-link customer-portal-sidebar-start"
              to={PORTAL_ORDER_CATALOG_PATH}
              state={START_NEW_PORTAL_ORDER_STATE}
              style={() => ({
                textDecoration: "none",
                borderRadius: "18px",
                padding: "14px 16px",
                color: "#ffffff",
                background: isOrderingCatalog
                  ? "linear-gradient(135deg, #115e59 0%, #0f766e 100%)"
                  : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: "0 16px 28px rgba(15, 118, 110, 0.16)",
                fontWeight: 800,
              })}
            >
              Start New Order
            </NavLink>

            <p className="customer-portal-sidebar-label">Portal Sections</p>

            {portalLinks.map((link) =>
              link.to === PORTAL_ORDER_CATALOG_PATH ? null : (
                <NavLink
                  className="customer-portal-section-link"
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
            )}
          </aside>

          <div
            className={`customer-portal-content ${
              isOrderingCatalog ? "customer-portal-ordering" : ""
            } ${isOrderingWorkflow ? "customer-portal-ordering-flow" : ""}`}
          >
            <Outlet context={{ customerSession }} />
          </div>
        </div>
      </main>

      <nav className="customer-portal-bottom-nav" aria-label="Primary shopping navigation">
        {mobileNavLinks.map((link) => {
          const active = isMobileNavActive(location.pathname, link.match);
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`customer-portal-bottom-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="customer-portal-bottom-nav-icon" aria-hidden="true">
                {link.match === "shop"
                  ? "◇"
                  : link.match === "orders"
                    ? "☰"
                    : link.match === "payments"
                      ? "$"
                      : "○"}
              </span>
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
