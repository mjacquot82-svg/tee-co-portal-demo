import { Component, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStoredOrders } from "../lib/ordersStore";
import { formatShortDate } from "../lib/dateFormatting";
import { isActiveOperationalStatus } from "../orders/orderWorkflow";
import {
  canAccessOperationalWorkspace,
  canAccessProtectedManagementRoute,
  classifyAdminRoute,
  getAssignedOrdersForStaff,
  getRouteAccessUser,
  getOperationalOrdersForStaff,
  hasOperationalSession,
  isAdminWorkspaceView,
  isStaffWorkspaceView,
  requiresProtectedManagementAccess,
  resolveOperationalRole,
} from "../admin/adminRoleView";
import {
  attemptStaffLogin,
  getPinAccessibleStaffUsers,
  getActiveStaffUser,
  subscribeToActiveStaffUser,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import {
  getActiveCustomerSession,
  subscribeToActiveCustomerSession,
} from "../lib/customerSessionStore";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import { getUserInitials } from "../utils/getUserInitials";
import AdminDiagnosticsPanel from "./AdminDiagnosticsPanel";
import { useStaffAssignmentAttention } from "../lib/staffAssignmentAttentionStore";
import { buildStaffAssignmentAttentionItems } from "../staff/buildStaffAssignmentAttentionItems";
import {
  ensureOperationalAuthInitialized,
  getOperationalAuthUser,
  isOperationalAuthLoading,
  signOutOperationalWorkspace,
  subscribeToOperationalAuth,
} from "../lib/operationalAuthStore";

const ADMIN_LOGO_SRC = "/tee&co512x512.png";
const FACEBOOK_URL =
  "https://www.facebook.com/p/Tee-Co-Ltd-100078145951464/";
const INSTAGRAM_URL = "https://www.instagram.com/teeandcodesigns/";

function summarizeRouteGuardUser(user) {
  if (!user) {
    return {
      exists: false,
      id: "",
      role: "",
      name: "",
      authMode: "",
    };
  }

  return {
    exists: true,
    id: user.id || "",
    role: user.role || "",
    name: user.name || "",
    authMode: user.authMode || "",
  };
}

function buildAdminRouteGuardSnapshot({
  pathname,
  search,
  authenticatedOperationalUser,
  activeStaffUser,
  routeAccessUser,
  operationalAuthLoading,
}) {
  const routeClassification = classifyAdminRoute(pathname);

  return {
    targetRoute: `${pathname}${search || ""}`,
    activeAuthenticatedUser: summarizeRouteGuardUser(authenticatedOperationalUser),
    activeOperator: summarizeRouteGuardUser(activeStaffUser),
    resolvedAccessIdentity: summarizeRouteGuardUser(routeAccessUser),
    routeClassification,
    canAccessOperationalWorkspaceResult: canAccessOperationalWorkspace(
      pathname,
      routeAccessUser
    ),
    canAccessProtectedManagementRouteResult: canAccessProtectedManagementRoute(
      pathname,
      routeAccessUser
    ),
    hasOperationalSession: hasOperationalSession(routeAccessUser),
    operationalAuthLoading,
  };
}

function logAdminRouteGuard(event, snapshot, details = {}) {
  if (!snapshot) return;

  const entry = {
    event,
    ...snapshot,
    redirectReason: details.redirectReason || "",
    fallbackTrigger: details.fallbackTrigger || "",
  };

  pushAuthDiagnostic(`route-guard-${event}`, entry);
  console.info("[route-guard]", entry);
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ width: "18px", height: "18px", fill: "currentColor" }}
    >
      <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.56c0-.93.26-1.56 1.6-1.56H16.8V4.14c-.3-.04-1.34-.14-2.56-.14-2.54 0-4.28 1.55-4.28 4.28v2.2H7.08v3.2h2.88V22h3.54Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ width: "18px", height: "18px", fill: "currentColor" }}
    >
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2.2A2.8 2.8 0 0 0 4.2 7v10A2.8 2.8 0 0 0 7 19.8h10a2.8 2.8 0 0 0 2.8-2.8V7A2.8 2.8 0 0 0 17 4.2H7Zm10.55 1.65a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2A2.8 2.8 0 1 0 12 14.8 2.8 2.8 0 0 0 12 9.2Z" />
    </svg>
  );
}

function getSidebarCounts({ operationalOrders = [], assignedOrders = [], staffWorkspace = false } = {}) {
  const activeOperationalOrders = operationalOrders.filter(
    (order) =>
      order.operational_visible !== false && isActiveOperationalStatus(order.status)
  );
  const activeAssignedOrders = assignedOrders.filter(
    (order) =>
      order.operational_visible !== false && isActiveOperationalStatus(order.status)
  );

  return {
    productionOrders: activeOperationalOrders.length,
    assignments: staffWorkspace
      ? activeAssignedOrders.length
      : activeOperationalOrders.filter(
          (order) =>
            order.needs_assignment || !order.assigned_to_staff_id
        ).length,
  };
}

function getAdminSections(staffUser) {
  if (!isAdminWorkspaceView(staffUser)) {
    return [
      {
        title: "Workspaces",
        links: [
          {
            to: "/admin",
            label: "My Assigned Work",
            navKey: "assignments",
            badgeKey: "assignments",
          },
          { to: "/admin/sales/new", label: "Front Counter", navKey: "frontCounter" },
          { to: "/admin/quotes", label: "Quotes", navKey: "quotes" },
          {
            to: "/admin/orders",
            label: "Shop Production",
            navKey: "productionOrders",
            badgeKey: "productionOrders",
          },
        ],
      },
    ];
  }

  const canManageCatalog = true;

  return [
    {
      title: "Overview",
      links: [
        { to: "/admin", label: "Dashboard", navKey: "dashboard" },
        { to: "/admin/staff-users", label: "Staff", navKey: "staffUsers" },
      ],
    },
    {
      title: "Workspaces",
      links: [
        { to: "/admin/sales/new", label: "Front Counter", navKey: "frontCounter" },
        { to: "/admin/quotes", label: "Quotes", navKey: "quotes" },
        {
          to: "/admin/orders",
          label: "Shop Production",
          navKey: "productionOrders",
          badgeKey: "productionOrders",
        },
        {
          to: "/admin/assignments",
          label: "Assignment Dispatch",
          navKey: "assignments",
          badgeKey: "assignments",
        },
        {
          to: "/admin/financial",
          label: "Invoices & Payments",
          navKey: "financial",
        },
      ],
    },
    {
      title: "Records",
      links: [
        { to: "/admin/customers", label: "Customer Lookup", navKey: "customers" },
        { to: "/admin/sales", label: "Sales History", navKey: "counterSales" },
        ...(canManageCatalog
          ? [
              { to: "/admin/garments", label: "Garment Library", navKey: "garments" },
              { to: "/admin/products", label: "Customer Catalog", navKey: "products" },
            ]
          : []),
        {
          to: "/admin/quotes/archived",
          label: "Archived Quotes",
          navKey: "archivedQuotes",
        },
        {
          to: "/admin/records/canceled",
          label: "Canceled Orders",
          navKey: "canceledOrders",
        },
      ],
    },
  ];
}

function getActiveSidebarLink(pathname, staffUser) {
  if (pathname.startsWith("/admin/assignments")) return "assignments";
  if (pathname.startsWith("/admin/garments")) return "garments";
  if (pathname.startsWith("/admin/products")) return "products";
  if (pathname.startsWith("/admin/customers")) return "customers";
  if (pathname.startsWith("/admin/staff-users")) return "staffUsers";
  if (pathname === "/admin/records/canceled") return "canceledOrders";
  if (pathname === "/admin/quotes/archived") return "archivedQuotes";
  if (pathname === "/admin/quotes") return "quotes";
  if (pathname.startsWith("/admin/quotes/")) return pathname === "/admin/quotes/new" ? "newQuote" : "quotes";
  if (pathname.startsWith("/admin/financial")) return "financial";
  if (pathname === "/admin/sales") return "counterSales";
  if (pathname === "/admin/sales/new") return "frontCounter";
  if (pathname.startsWith("/admin/sales/receipt/")) {
    return isStaffWorkspaceView(staffUser) ? "frontCounter" : "counterSales";
  }
  if (pathname === "/admin/orders") return "productionOrders";
  if (pathname.startsWith("/admin/orders/")) return "productionOrders";
  if (pathname === "/admin") {
    return isStaffWorkspaceView(staffUser) ? "assignments" : "dashboard";
  }
  return "";
}

function AttentionBadge({ count, active = false }) {
  if (!count) return null;

  return (
    <span
      style={{
        minWidth: "20px",
        height: "20px",
        padding: "0 6px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "#dbeafe" : "#fff7ed",
        color: active ? "#1d4ed8" : "#c2410c",
        border: active ? "1px solid #bfdbfe" : "1px solid #fed7aa",
        fontSize: "11px",
        fontWeight: 900,
      }}
    >
      {count}
    </span>
  );
}

function buildAttentionTimestampLabel(value) {
  const timestamp = new Date(value || "").getTime();
  if (!timestamp) return "";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return formatShortDate(value);
}

function StaffAttentionStrip({ items = [] }) {
  if (!items.length) return null;

  const toneStyles = {
    default: {
      background: "#f8fafc",
      border: "#e2e8f0",
      badgeBackground: "#e2e8f0",
      badgeColor: "#334155",
    },
    warning: {
      background: "#fff7ed",
      border: "#fed7aa",
      badgeBackground: "#ffedd5",
      badgeColor: "#c2410c",
    },
    success: {
      background: "#ecfdf5",
      border: "#bbf7d0",
      badgeBackground: "#dcfce7",
      badgeColor: "#166534",
    },
    danger: {
      background: "#fef2f2",
      border: "#fecaca",
      badgeBackground: "#fee2e2",
      badgeColor: "#b91c1c",
    },
  };

  return (
    <section
      style={{
        marginTop: "4px",
        marginBottom: "16px",
        display: "grid",
        gap: "8px",
      }}
    >
      <div>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "11px",
            fontWeight: 900,
            color: "#78716c",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Assignment Attention
        </p>
        <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.4 }}>
          New assignments stay visible here until you open the work order.
        </p>
      </div>

      {items.map((item) => {
        const tone = toneStyles[item.tone] || toneStyles.default;

        return (
          <Link
            key={item.key}
            to={item.to}
            style={{
              display: "grid",
              gap: "6px",
              textDecoration: "none",
              color: "#171717",
              borderRadius: "14px",
              border: `1px solid ${tone.border}`,
              background: tone.background,
              padding: "10px 11px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "4px 8px",
                  background: tone.badgeBackground,
                  color: tone.badgeColor,
                  fontSize: "10px",
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {item.label}
              </span>
              <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 700 }}>
                {buildAttentionTimestampLabel(item.timestamp)}
              </span>
            </div>

            <span style={{ fontSize: "12px", lineHeight: 1.4, color: "#334155" }}>
              {item.detail}
            </span>

            <span style={{ fontSize: "12px", lineHeight: 1.4, color: "#64748b" }}>
              {item.supportingDetail}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function SocialLinks({ compact = false }) {
  const linkStyle = compact
    ? {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "38px",
        height: "38px",
        borderRadius: "999px",
        border: "1px solid #dbe4ee",
        color: "#171717",
        background: "#ffffff",
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "12px",
        border: "1px solid #dbe4ee",
        color: "#171717",
        background: "#ffffff",
        textDecoration: "none",
        fontWeight: 700,
      };

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" style={linkStyle}>
        <FacebookIcon />
        {compact ? null : <span>Facebook</span>}
      </a>

      <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={linkStyle}>
        <InstagramIcon />
        {compact ? null : <span>Instagram</span>}
      </a>
    </div>
  );
}

function AdminSidebar({ pathname, staffUser }) {
  const orders = useStoredOrders();
  const assignmentAttentionState = useStaffAssignmentAttention();
  const staffWorkspace = isStaffWorkspaceView(staffUser);
  const operationalOrders = isAdminWorkspaceView(staffUser)
    ? orders
    : getOperationalOrdersForStaff(orders);
  const assignedOrders = isAdminWorkspaceView(staffUser)
    ? orders
    : getAssignedOrdersForStaff(orders, staffUser);
  const badgeCounts = getSidebarCounts({
    operationalOrders,
    assignedOrders,
    staffWorkspace,
  });
  const activeLink = getActiveSidebarLink(pathname, staffUser);
  const adminSections = getAdminSections(staffUser);
  const workspaceLabel = staffWorkspace
    ? "Staff Operations"
    : "Central Operations";
  const staffAttentionItems = staffWorkspace
    ? buildStaffAssignmentAttentionItems({
        assignedOrders,
        staffUser,
        attentionState: assignmentAttentionState,
      })
    : [];

  return (
    <aside
      style={{
        width: "220px",
        minWidth: "220px",
        maxWidth: "220px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: "100vh",
        background: "#ffffff",
        borderRight: "1px solid #e2e8f0",
        padding: "18px 12px 16px",
        boxSizing: "border-box",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
      }}
    >
      <Link
        to="/admin"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          textDecoration: "none",
          color: "#171717",
          marginBottom: "22px",
          minHeight: "56px",
        }}
      >
        <div
          style={{
            width: "54px",
            height: "54px",
            minWidth: "54px",
            minHeight: "54px",
            maxWidth: "54px",
            maxHeight: "54px",
            overflow: "hidden",
            borderRadius: "12px",
            flexShrink: 0,
          }}
        >
          <img
            className="tee-co-logo"
            src={ADMIN_LOGO_SRC}
            alt="Tee & Co"
            width="54"
            height="54"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <div style={{ overflow: "hidden" }}>
          <strong
            style={{
              display: "block",
              fontSize: "19px",
              lineHeight: 1.1,
            }}
          >
            Tee & Co
          </strong>

          <span
            style={{
              color: "#64748b",
              fontSize: "12px",
              whiteSpace: "nowrap",
            }}
          >
            {workspaceLabel}
          </span>
        </div>
      </Link>

      {adminSections.map((section) => (
        <div key={section.title} style={{ marginBottom: "16px" }}>
          <p
            style={{
              margin: "0 0 7px",
              fontSize: "11px",
              fontWeight: 900,
              color: "#78716c",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {section.title}
          </p>

          <div style={{ display: "grid", gap: "4px" }}>
            {section.links.map((link) => {
              const active = activeLink === (link.navKey || link.to);
              const navItemStyle = {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: active ? "11px 12px" : "10px 11px",
                borderRadius: "12px",
                background: active
                  ? "#eff6ff"
                  : "#ffffff",
                textDecoration: "none",
                border: active
                  ? "1px solid #bfdbfe"
                  : "1px solid #e2e8f0",
                fontWeight: active ? 800 : 700,
                boxShadow: active
                  ? "none"
                  : "none",
                cursor: active ? "default" : "pointer",
                pointerEvents: active ? "none" : "auto",
                color: active ? "#1d4ed8" : "#171717",
              };

              const content = (
                <>
                  <span>{link.label}</span>
                  <AttentionBadge
                    count={badgeCounts[link.badgeKey]}
                    active={active}
                  />
                </>
              );

              if (active) {
                return (
                  <div
                    key={link.to}
                    aria-current="page"
                    style={navItemStyle}
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link key={link.to} to={link.to} style={navItemStyle}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {staffWorkspace ? <StaffAttentionStrip items={staffAttentionItems} /> : null}

      <div
        style={{
          marginTop: "auto",
          paddingTop: "18px",
          borderTop: "1px solid #e2e8f0",
          display: "grid",
          gap: "10px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            fontWeight: 900,
            color: "#78716c",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Tee & Co Social
        </p>

        <SocialLinks compact />
      </div>
    </aside>
  );
}

function PublicHeader() {
  const navigate = useNavigate();
  const [activeCustomerSession, setActiveCustomerSession] = useState(() =>
    getActiveCustomerSession()
  );
  const customerInitials = getUserInitials(activeCustomerSession?.displayName);

  useEffect(() => {
    function syncActiveCustomerSession(
      nextCustomerSession = getActiveCustomerSession()
    ) {
      setActiveCustomerSession(nextCustomerSession);
    }

    syncActiveCustomerSession();

    return subscribeToActiveCustomerSession((nextCustomerSession) => {
      syncActiveCustomerSession(nextCustomerSession);
    });
  }, []);

  async function handleCustomerLogout() {
    await signOutOperationalWorkspace();
    clearAllAuthSessions("customer-logout");
    pushAuthDiagnostic("login-redirect", {
      actorType: "customer",
      target: "/login",
    });
    navigate("/login", { replace: true });
  }

  return (
    <header
      style={{
        borderBottom: "1px solid #e2e8f0",
        background: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 50,
        minHeight: "84px",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          minHeight: "84px",
          boxSizing: "border-box",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            textDecoration: "none",
            color: "#171717",
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              minWidth: "56px",
              minHeight: "56px",
              maxWidth: "56px",
              maxHeight: "56px",
              overflow: "hidden",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          >
            <img
              className="tee-co-logo"
              src={ADMIN_LOGO_SRC}
              alt="Tee & Co"
              width="56"
              height="56"
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>

          <div>
            <strong
              style={{
                fontSize: "24px",
                display: "block",
              }}
            >
              Tee & Co Ltd.
            </strong>

            <span
              style={{
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              Made local, worn proud
            </span>
          </div>
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexShrink: 0,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <SocialLinks compact />

          {activeCustomerSession ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#fafaf9",
                border: "1px solid #e7e5e4",
                borderRadius: "16px",
                padding: "8px 10px 8px 8px",
                maxWidth: "100%",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "999px",
                  background: "#171717",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "13px",
                  flexShrink: 0,
                }}
              >
                {customerInitials}
              </div>

              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: "0 0 3px",
                    color: "#78716c",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Customer Portal
                </p>
                <p
                  style={{
                    margin: 0,
                    color: "#171717",
                    fontWeight: 800,
                    lineHeight: 1.2,
                    wordBreak: "break-word",
                  }}
                >
                  {activeCustomerSession.displayName}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCustomerLogout}
                style={{
                  background: "#171717",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              style={{
                background: "#171717",
                color: "#ffffff",
                padding: "11px 18px",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function OperationalIdentitySwitcher({ staffUser }) {
  const [staffOptions, setStaffOptions] = useState(() => getPinAccessibleStaffUsers());
  const [selectedStaffUserId, setSelectedStaffUserId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function syncStaffOptions(nextUsers = getPinAccessibleStaffUsers()) {
      setStaffOptions(nextUsers);
    }

    syncStaffOptions();
    return subscribeToStaffUsers((nextUsers) => {
      syncStaffOptions(nextUsers.filter((user) => user.status !== "Inactive"));
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setError("");
        setPin("");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const resolvedSelectedStaffUserId =
    staffUser?.id && staffOptions.some((user) => user.id === staffUser.id)
      ? staffUser.id
      : staffOptions.some((user) => user.id === selectedStaffUserId)
        ? selectedStaffUserId
        : staffOptions[0]?.id || "";

  function handleSwitch(event) {
    event.preventDefault();

    if (!resolvedSelectedStaffUserId) {
      setError("Select a staff profile first.");
      return;
    }

    if (String(pin).replace(/\D/g, "").length !== 4) {
      setError("Enter the 4-digit staff PIN.");
      return;
    }

    const result = attemptStaffLogin({
      staffUserId: resolvedSelectedStaffUserId,
      pin,
      persistSession: true,
    });

    if (!result.ok) {
      setError(result.message);
      setPin("");
      return;
    }

    setSelectedStaffUserId(result.user?.id || resolvedSelectedStaffUserId);
    setError("");
    setPin("");
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          background: "#eff6ff",
          color: "#1d4ed8",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "10px 14px",
          fontWeight: 800,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Switch Operator
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Switch operator"
          onClick={() => {
            setIsOpen(false);
            setError("");
            setPin("");
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              borderRadius: "24px",
              border: "1px solid #dbe4ee",
              background: "#ffffff",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Workstation
              </p>
              <h2 style={{ margin: 0, color: "#171717", fontSize: "24px", lineHeight: 1.1 }}>
                Switch operator
              </h2>
              <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.55 }}>
                Select the next operator and enter the PIN.
              </p>
            </div>

            <form onSubmit={handleSwitch} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label
                  htmlFor="workstation-staff-user"
                  style={{ color: "#171717", fontSize: "13px", fontWeight: 800 }}
                >
                  Switch to
                </label>
                <select
                  id="workstation-staff-user"
                  value={resolvedSelectedStaffUserId}
                  onChange={(event) => {
                    setError("");
                    setSelectedStaffUserId(event.target.value);
                  }}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "14px",
                    color: "#171717",
                  }}
                >
                  {staffOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: "4px" }}>
                <label
                  htmlFor="workstation-staff-pin"
                  style={{ color: "#171717", fontSize: "13px", fontWeight: 800 }}
                >
                  Staff PIN
                </label>
                <input
                  id="workstation-staff-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => {
                    setError("");
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                  }}
                  placeholder="4-digit PIN"
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "14px",
                    color: "#171717",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {error ? (
                <p style={{ margin: 0, color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>
                  {error}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={!staffOptions.length}
                  style={{
                    background: staffOptions.length ? "#171717" : "#94a3b8",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 800,
                    cursor: staffOptions.length ? "pointer" : "not-allowed",
                  }}
                >
                  Switch Operator
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setError("");
                    setPin("");
                  }}
                  style={{
                    background: "#f8fafc",
                    color: "#475569",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AdminWorkspaceHeader({ staffUser }) {
  const navigate = useNavigate();
  const initials = getUserInitials(staffUser?.name);
  const displayName = staffUser?.name || "Operations";
  const displayRole = staffUser?.role || "Workspace";

  async function handleLockWorkstation() {
    await signOutOperationalWorkspace();
    clearAllAuthSessions("staff-logout");
    pushAuthDiagnostic("login-redirect", {
      actorType: "staff",
      userId: staffUser?.id || "",
      role: staffUser?.role || "",
      target: "/login",
    });
    navigate("/login", { replace: true });
  }

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "18px 24px 0",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "10px 12px",
            boxShadow: "0 6px 20px rgba(15, 23, 42, 0.06)",
            maxWidth: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              minWidth: 0,
              flex: "1 1 240px",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "999px",
                background: "#171717",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "13px",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
              <span
                style={{
                  color: "#64748b",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Workstation
              </span>
              <p
                style={{
                  margin: 0,
                  color: "#171717",
                  fontSize: "14px",
                  fontWeight: 800,
                  lineHeight: 1.25,
                  wordBreak: "break-word",
                }}
              >
                {displayName}
                <span style={{ color: "#64748b", fontWeight: 700 }}>
                  {" "}
                  ({displayRole})
                </span>
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <OperationalIdentitySwitcher staffUser={staffUser} />

            {staffUser ? (
              <button
                type="button"
                onClick={handleLockWorkstation}
                style={{
                  background: "#171717",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Lock Workstation
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function AdminAuthLoadingState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        boxSizing: "border-box",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "24px",
          padding: "28px",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Tee &amp; Co Operations
        </p>
        <h1
          style={{
            margin: "0 0 8px",
            color: "#0f172a",
            fontSize: "28px",
            lineHeight: 1.1,
          }}
        >
          Restoring session
        </h1>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
          Checking access.
        </p>
      </div>
    </div>
  );
}

class AdminRenderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error) {
    pushAuthDiagnostic("admin-render-failed", {
      pathname: this.props.pathname || "",
      userId: this.props.staffUser?.id || "",
      role: this.props.staffUser?.role || "",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  render() {
    if (this.state.error) {
      return (
        <AdminDiagnosticsPanel
          title="Owner workspace failed to render"
          message="The admin route hit a render error after login. Diagnostics are shown here so the screen never collapses to blank."
          staffUser={this.props.staffUser}
          pathname={this.props.pathname}
          workspaceAccess={this.props.workspaceAccess}
          error={this.state.error.message}
        />
      );
    }

    return this.props.children;
  }
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith("/admin");
  const requiresManagementAccess = requiresProtectedManagementAccess(location.pathname);
  const requiresCustomerSession = location.pathname === "/my-orders";
  const [authenticatedOperationalUser, setAuthenticatedOperationalUser] = useState(() =>
    getOperationalAuthUser()
  );
  const [activeStaffUser, setActiveStaffUser] = useState(() => getActiveStaffUser());
  const [operationalAuthLoading, setOperationalAuthLoading] = useState(() =>
    isOperationalAuthLoading()
  );
  const [activeCustomerSession, setActiveCustomerSession] = useState(() =>
    getActiveCustomerSession()
  );
  const routeAccessUser = isAdmin
    ? getRouteAccessUser({
        authenticatedUser: authenticatedOperationalUser,
        activeStaffUser,
      })
    : null;
  const adminRouteGuardSnapshot = isAdmin
    ? buildAdminRouteGuardSnapshot({
        pathname: location.pathname,
        search: location.search,
        authenticatedOperationalUser,
        activeStaffUser,
        routeAccessUser,
        operationalAuthLoading,
      })
    : null;

  useEffect(() => {
    void ensureOperationalAuthInitialized().then((snapshot) => {
      setOperationalAuthLoading(snapshot.isLoading);
      setAuthenticatedOperationalUser(snapshot.operationalUser);
      setActiveStaffUser(getActiveStaffUser());
    });

    return subscribeToOperationalAuth((snapshot) => {
      setOperationalAuthLoading(snapshot.isLoading);
      setAuthenticatedOperationalUser(snapshot.operationalUser);
      setActiveStaffUser(getActiveStaffUser());
    });
  }, []);

  useEffect(() => {
    function syncActiveStaffUser(nextStaffUser = getActiveStaffUser()) {
      setActiveStaffUser(nextStaffUser);
    }

    syncActiveStaffUser();

    return subscribeToActiveStaffUser((nextStaffUser) => {
      syncActiveStaffUser(nextStaffUser);
    });
  }, []);

  useEffect(() => {
    function syncActiveCustomerSession(nextCustomerSession = getActiveCustomerSession()) {
      setActiveCustomerSession(nextCustomerSession);
    }

    syncActiveCustomerSession();

    return subscribeToActiveCustomerSession((nextCustomerSession) => {
      syncActiveCustomerSession(nextCustomerSession);
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (operationalAuthLoading && requiresManagementAccess) return;

    logAdminRouteGuard("evaluate", adminRouteGuardSnapshot);

    pushAuthDiagnostic("role-resolution", {
      pathname: location.pathname,
      authenticatedUserId: authenticatedOperationalUser?.id || "",
      authenticatedUserRole: authenticatedOperationalUser?.role || "",
      currentUserId: activeStaffUser?.id || "",
      currentUserRole: activeStaffUser?.role || "",
      accessUserId: routeAccessUser?.id || "",
      accessUserRole: routeAccessUser?.role || "",
      routeClassification: adminRouteGuardSnapshot?.routeClassification?.classification || "",
      matchedManagementRule:
        adminRouteGuardSnapshot?.routeClassification?.matchedManagementRule || "",
      requiresManagementAccess,
      workspaceAccess: adminRouteGuardSnapshot?.canAccessOperationalWorkspaceResult
        ? "allowed"
        : "blocked",
      managementAccess: adminRouteGuardSnapshot?.canAccessProtectedManagementRouteResult
        ? "allowed"
        : "blocked",
    });

    if (!hasOperationalSession(routeAccessUser)) {
      logAdminRouteGuard("redirect", adminRouteGuardSnapshot, {
        redirectReason: activeCustomerSession
          ? "customer-session-cannot-open-admin"
          : "missing-operational-session",
      });

      if (activeCustomerSession) {
        pushAuthDiagnostic("login-redirect", {
          actorType: "customer",
          target: "/my-orders",
          reason: "customer-session-cannot-open-admin",
          pathname: location.pathname,
        });
        navigate("/my-orders", { replace: true });
        return;
      }

      pushAuthDiagnostic("login-redirect", {
        actorType: "staff",
        target: "/login",
        reason: "missing-operational-session",
        pathname: location.pathname,
      });
      navigate(`/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`, {
        replace: true,
      });
      return;
    }

    if (
      requiresManagementAccess &&
      !canAccessProtectedManagementRoute(location.pathname, routeAccessUser)
    ) {
      logAdminRouteGuard("fallback", adminRouteGuardSnapshot, {
        redirectReason: activeCustomerSession
          ? "customer-session-cannot-open-management"
          : canAccessOperationalWorkspace("/admin", routeAccessUser)
            ? "management-route-blocked-for-operational-session"
            : "missing-management-session",
        fallbackTrigger: activeCustomerSession
          ? "customer-redirect"
          : canAccessOperationalWorkspace("/admin", routeAccessUser)
            ? "management-classification-block"
            : "login-redirect",
      });

      if (activeCustomerSession) {
        pushAuthDiagnostic("login-redirect", {
          actorType: "customer",
          target: "/my-orders",
          reason: "customer-session-cannot-open-management",
          pathname: location.pathname,
        });
        navigate("/my-orders", { replace: true });
        return;
      }

      if (canAccessOperationalWorkspace("/admin", routeAccessUser)) {
        return;
      }

      pushAuthDiagnostic("login-redirect", {
        actorType: "staff",
        userId: routeAccessUser?.id || "",
        role: routeAccessUser?.role || "",
        target: "/login",
        reason: "missing-management-session",
        pathname: location.pathname,
      });
      navigate(
        `/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`,
        { replace: true }
      );
      return;
    }

    if (canAccessOperationalWorkspace(location.pathname, routeAccessUser)) return;

    logAdminRouteGuard("fallback", adminRouteGuardSnapshot, {
      redirectReason: "workspace-blocked",
      fallbackTrigger: "workspace-classification-block",
    });

    pushAuthDiagnostic("login-redirect", {
      actorType: "staff",
      userId: routeAccessUser?.id || "",
      role: routeAccessUser?.role || "",
      target: "",
      reason: "workspace-blocked",
      pathname: location.pathname,
    });
  }, [
    activeCustomerSession,
    activeStaffUser,
    adminRouteGuardSnapshot,
    authenticatedOperationalUser,
    isAdmin,
    location.pathname,
    location.search,
    navigate,
    operationalAuthLoading,
    routeAccessUser,
    requiresManagementAccess,
  ]);

  useEffect(() => {
    if (!requiresCustomerSession) return;
    if (activeCustomerSession) return;

    pushAuthDiagnostic("login-redirect", {
      actorType: "customer",
      target: "/login",
      reason: "missing-customer-session",
      pathname: location.pathname,
    });
    navigate("/login", { replace: true });
  }, [activeCustomerSession, location.pathname, navigate, requiresCustomerSession]);

  const visibleStaffUser = isAdmin ? routeAccessUser : null;
  const currentOperator = isAdmin ? activeStaffUser || routeAccessUser : null;
  const resolvedStaffRole = resolveOperationalRole(visibleStaffUser);
  const workspaceAccess = isAdmin
    ? canAccessOperationalWorkspace(location.pathname, visibleStaffUser)
      ? "allowed"
      : "blocked"
    : "public";
  const managementAccess = isAdmin
    ? canAccessProtectedManagementRoute(location.pathname, visibleStaffUser)
      ? "allowed"
      : "blocked"
    : "public";

  if (isAdmin && requiresManagementAccess && operationalAuthLoading) {
    return <AdminAuthLoadingState />;
  }

  if (
    isAdmin &&
    visibleStaffUser &&
    requiresManagementAccess &&
    !canAccessProtectedManagementRoute(location.pathname, visibleStaffUser)
  ) {
    console.warn("[route-guard] visible fallback", {
      ...adminRouteGuardSnapshot,
      redirectReason: "management-route-blocked-for-operational-session",
      fallbackTrigger: "management-classification-block",
    });
    return (
      <AdminDiagnosticsPanel
        title="Management route blocked by runtime classification"
        message="This admin route is being rejected at runtime even though an operational session exists. Check the route-guard console logs for the exact classification and identity that caused the block."
        staffUser={visibleStaffUser}
        pathname={location.pathname}
        workspaceAccess={`${workspaceAccess} / management ${managementAccess}`}
      />
    );
  }

  if (isAdmin && location.pathname.startsWith("/admin/garments")) {
    console.log("[Layout] admin garments route render gate", {
      pathname: location.pathname,
      hasVisibleStaffUser: Boolean(visibleStaffUser),
      visibleStaffUserId: visibleStaffUser?.id || "",
      visibleStaffUserRole: visibleStaffUser?.role || "",
      resolvedStaffRole: resolvedStaffRole || "",
      workspaceAccess,
    });
  }

  if (isAdmin && !visibleStaffUser) {
    if (location.pathname.startsWith("/admin/garments")) {
      console.warn("[Layout] blocking admin garments route before Outlet render: missing visible staff user", {
        pathname: location.pathname,
        workspaceAccess,
      });
    }
    return (
      <AdminDiagnosticsPanel
        title="Operational session missing"
        message="The admin route loaded without an active staff session, so the workspace cannot mount."
        pathname={location.pathname}
        workspaceAccess={workspaceAccess}
      />
    );
  }

  if (isAdmin && !resolvedStaffRole) {
    if (location.pathname.startsWith("/admin/garments")) {
      console.warn("[Layout] blocking admin garments route before Outlet render: unresolved staff role", {
        pathname: location.pathname,
        visibleStaffUser,
        workspaceAccess,
      });
    }
    return (
      <AdminDiagnosticsPanel
        title="Operational role could not be resolved"
        message="A staff session exists, but its role is not one of Owner, Manager, or Staff, so the workspace has been paused before rendering."
        staffUser={visibleStaffUser}
        pathname={location.pathname}
        workspaceAccess={workspaceAccess}
      />
    );
  }

  if (isAdmin && workspaceAccess !== "allowed") {
    console.warn("[route-guard] visible fallback", {
      ...adminRouteGuardSnapshot,
      redirectReason: "workspace-blocked",
      fallbackTrigger: "workspace-classification-block",
    });
    return (
      <AdminDiagnosticsPanel
        title="Admin route blocked by runtime workspace access"
        message="This admin route was denied by the workspace guard. The route-guard console logs include the target route, active operator, resolved access identity, classification, and exact block reason."
        staffUser={visibleStaffUser}
        pathname={location.pathname}
        workspaceAccess={workspaceAccess}
      />
    );
  }

  return (
    <div>
      {isAdmin ? (
        <AdminRenderBoundary
          pathname={location.pathname}
          staffUser={visibleStaffUser}
          workspaceAccess={workspaceAccess}
        >
          {location.pathname.startsWith("/admin/garments")
            ? console.log("[Layout] allowing admin garments Outlet render", {
                pathname: location.pathname,
                visibleStaffUserId: visibleStaffUser?.id || "",
                resolvedStaffRole,
                workspaceAccess,
              })
            : null}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <AdminSidebar
              pathname={location.pathname}
              search={location.search}
              staffUser={visibleStaffUser}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <AdminWorkspaceHeader
                staffUser={currentOperator}
              />

              <main style={{ minWidth: 0 }}>
                <Outlet />
              </main>
            </div>
          </div>
        </AdminRenderBoundary>
      ) : (
        <>
          <PublicHeader />

          <main>
            <Outlet />
          </main>
        </>
      )}
    </div>
  );
}
