import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  canAccessOperationalWorkspace,
  canAccessProtectedManagementRoute,
  getRouteAccessUser,
  requiresProtectedManagementAccess,
} from "../admin/adminRoleView";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import {
  ensureOperationalAuthInitialized,
  getOperationalAuthUser,
  isOperationalAuthLoading,
  signInToOperationalWorkspace,
  subscribeToOperationalAuth,
} from "../lib/operationalAuthStore";
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

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #d6d3d1",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "700",
  color: "#292524",
};

const buttonStyle = {
  width: "100%",
  background: "#171717",
  color: "#ffffff",
  border: "none",
  borderRadius: "14px",
  padding: "14px 18px",
  fontWeight: "800",
  fontSize: "15px",
  cursor: "pointer",
  boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)",
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#f8fafc",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  boxShadow: "none",
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [staffOptions, setStaffOptions] = useState(() => getPinAccessibleStaffUsers());
  const [selectedStaffUserId, setSelectedStaffUserId] = useState(() => getPinAccessibleStaffUsers()[0]?.id || "");
  const [staffPin, setStaffPin] = useState("");
  const [staffError, setStaffError] = useState("");
  const [workspaceEmail, setWorkspaceEmail] = useState("");
  const [workspacePassword, setWorkspacePassword] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [activeStaffUser, setActiveStaffUser] = useState(() => getActiveStaffUser());
  const [activeOperationalUser, setActiveOperationalUser] = useState(() =>
    getOperationalAuthUser()
  );
  const [operationalAuthLoading, setOperationalAuthLoading] = useState(() =>
    isOperationalAuthLoading()
  );
  const [activeCustomerSession, setActiveCustomerSession] = useState(() =>
    getActiveCustomerSession()
  );

  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo === "/my-orders" ||
    (redirectTo && redirectTo.startsWith("/portal")) ||
    (redirectTo && redirectTo.startsWith("/admin"))
      ? redirectTo
      : "/admin";
  const targetIsAdminRoute = resolvedRedirectTarget.startsWith("/admin");
  const targetIsCustomerRoute =
    resolvedRedirectTarget === "/my-orders" ||
    resolvedRedirectTarget.startsWith("/portal");
  const targetNeedsManagement =
    targetIsAdminRoute && requiresProtectedManagementAccess(resolvedRedirectTarget);
  const routeAccessUser = getRouteAccessUser({
    authenticatedUser: activeOperationalUser,
    activeStaffUser,
  });

  useEffect(() => {
    void ensureOperationalAuthInitialized().then((snapshot) => {
      setOperationalAuthLoading(snapshot.isLoading);
      setActiveOperationalUser(snapshot.operationalUser);
    });

    return subscribeToOperationalAuth((snapshot) => {
      setOperationalAuthLoading(snapshot.isLoading);
      setActiveOperationalUser(snapshot.operationalUser);
    });
  }, []);

  useEffect(() => {
    function syncStaffOptions(nextUsers = getPinAccessibleStaffUsers()) {
      const activeUsers = nextUsers.filter((user) => user.status !== "Inactive");
      setStaffOptions(activeUsers);
      setSelectedStaffUserId((currentValue) => {
        if (activeUsers.some((user) => user.id === currentValue)) {
          return currentValue;
        }

        return activeUsers[0]?.id || "";
      });
    }

    syncStaffOptions();

    return subscribeToStaffUsers((nextUsers) => {
      syncStaffOptions(nextUsers);
    });
  }, []);

  useEffect(() => {
    function syncActiveStaff(nextStaffUser = getActiveStaffUser()) {
      setActiveStaffUser(nextStaffUser);
    }

    syncActiveStaff();

    return subscribeToActiveStaffUser((nextStaffUser) => {
      syncActiveStaff(nextStaffUser);
    });
  }, []);

  useEffect(() => {
    function syncActiveCustomer(nextCustomerSession = getActiveCustomerSession()) {
      setActiveCustomerSession(nextCustomerSession);
    }

    syncActiveCustomer();

    return subscribeToActiveCustomerSession((nextCustomerSession) => {
      syncActiveCustomer(nextCustomerSession);
    });
  }, []);

  useEffect(() => {
    if (operationalAuthLoading) return;

    if (targetNeedsManagement) {
      if (canAccessProtectedManagementRoute(resolvedRedirectTarget, routeAccessUser)) {
        navigate(resolvedRedirectTarget, { replace: true });
        return;
      }

      if (canAccessOperationalWorkspace("/admin", routeAccessUser)) {
        navigate("/admin", { replace: true });
      }
      return;
    }

    if (targetIsCustomerRoute) {
      if (!activeCustomerSession) return;
      navigate(resolvedRedirectTarget, { replace: true });
      return;
    }

    if (targetIsAdminRoute) {
      if (canAccessOperationalWorkspace(resolvedRedirectTarget, routeAccessUser)) {
        navigate(resolvedRedirectTarget, { replace: true });
        return;
      }

      if (activeCustomerSession) {
        navigate("/portal/orders", { replace: true });
      }
      return;
    }

    if (activeCustomerSession) {
      navigate("/portal/orders", { replace: true });
      return;
    }

    if (routeAccessUser?.id) {
      navigate("/admin", { replace: true });
    }
  }, [
    activeCustomerSession,
    activeOperationalUser,
    activeStaffUser,
    navigate,
    operationalAuthLoading,
    resolvedRedirectTarget,
    routeAccessUser,
    targetIsAdminRoute,
    targetIsCustomerRoute,
    targetNeedsManagement,
  ]);

  async function handleStaffLogin(event) {
    event.preventDefault();

    if (!selectedStaffUserId) {
      setStaffError("Select a staff account.");
      return;
    }

    if (String(staffPin).replace(/\D/g, "").length !== 4) {
      setStaffError("Enter the 4-digit PIN.");
      return;
    }

    clearAllAuthSessions("staff-login-session-reset");

    const loginResult = await attemptStaffLogin({
      staffUserId: selectedStaffUserId,
      pin: staffPin,
      persistSession: true,
    });

    if (!loginResult.ok) {
      setStaffError(loginResult.message);
      setStaffPin("");
      return;
    }

    const nextTarget = canAccessOperationalWorkspace(resolvedRedirectTarget, loginResult.user)
      ? resolvedRedirectTarget
      : "/admin";

    pushAuthDiagnostic("login-redirect", {
      actorType: "staff",
      userId: loginResult.user?.id || "",
      role: loginResult.user?.role || "",
      target: nextTarget,
    });

    navigate(nextTarget, { replace: true });
  }

  async function handleWorkspaceLogin(event) {
    event.preventDefault();
    const normalizedEmail = workspaceEmail.trim();

    if (!normalizedEmail || !workspacePassword) {
      setWorkspaceError("Enter your email and password.");
      return;
    }

    setWorkspaceSubmitting(true);
    setWorkspaceError("");

    const loginResult = await signInToOperationalWorkspace({
      email: normalizedEmail,
      password: workspacePassword,
    });

    setWorkspaceSubmitting(false);

    if (!loginResult.ok) {
      setWorkspaceError(loginResult.message);
      setWorkspacePassword("");
      return;
    }

    clearAllAuthSessions("workspace-login-session-reset");

    const postLoginAccessUser = getRouteAccessUser({
      authenticatedUser: loginResult.user,
      activeStaffUser: getActiveStaffUser(),
    });

    const nextTarget =
      loginResult.actorType === "customer"
        ? targetIsCustomerRoute
          ? resolvedRedirectTarget === "/my-orders"
            ? "/portal/orders"
            : resolvedRedirectTarget
          : "/portal/orders"
        : canAccessProtectedManagementRoute(resolvedRedirectTarget, postLoginAccessUser)
          ? resolvedRedirectTarget
          : targetIsAdminRoute &&
              canAccessOperationalWorkspace(resolvedRedirectTarget, postLoginAccessUser)
            ? resolvedRedirectTarget
            : "/admin";

    pushAuthDiagnostic("login-redirect", {
      actorType: loginResult.actorType || "staff",
      userId: loginResult.user?.id || "",
      role: loginResult.user?.role || "",
      target: nextTarget,
    });
    navigate(nextTarget, { replace: true });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(191, 219, 254, 0.42), transparent 28%), radial-gradient(circle at bottom right, rgba(253, 230, 138, 0.2), transparent 26%), linear-gradient(180deg, #fafaf9 0%, #f8fafc 100%)",
        padding: "40px 24px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "980px",
          margin: "0 auto",
          background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
          borderRadius: "32px",
          border: "1px solid #e2e8f0",
          padding: "32px 32px 28px",
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.08)",
          display: "grid",
          gap: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "12px", maxWidth: "620px" }}>
          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Tee &amp; Co
          </p>
          <h1
            style={{
              margin: 0,
              color: "#0f172a",
              fontSize: "42px",
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
            }}
          >
            Choose how you work today.
          </h1>
          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: "16px",
              lineHeight: 1.6,
            }}
          >
            Customers sign in to the portal for approvals, invoices, payments, and order updates.
            Staff use a PIN for fast access at the counter, in production, or at dispatch.
          </p>
        </div>

        <section
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "16px",
              padding: "22px",
              borderRadius: "24px",
              border: "1px solid #dbeafe",
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <p
                style={{
                  margin: 0,
                  color: "#0369a1",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Customer Portal
              </p>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Customer Sign In
              </h2>
              <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
                Open your portal to review quotes, check invoices, make payments, and follow order
                progress.
              </p>
            </div>

            <form onSubmit={handleWorkspaceLogin} style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={workspaceEmail}
                  onChange={(event) => {
                    setWorkspaceError("");
                    setWorkspaceEmail(event.target.value);
                  }}
                  placeholder="you@example.com"
                  style={inputStyle}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              <div>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={workspacePassword}
                  onChange={(event) => {
                    setWorkspaceError("");
                    setWorkspacePassword(event.target.value);
                  }}
                  placeholder="Enter password"
                  style={inputStyle}
                />
              </div>

              {workspaceError ? (
                <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{workspaceError}</p>
              ) : null}

              <button
                type="submit"
                disabled={workspaceSubmitting}
                style={{
                  ...secondaryButtonStyle,
                  background: workspaceSubmitting ? "#e2e8f0" : "#f8fafc",
                  color: workspaceSubmitting ? "#475569" : "#0f172a",
                  cursor: workspaceSubmitting ? "wait" : "pointer",
                }}
              >
                {workspaceSubmitting ? "Signing In..." : "Open Portal"}
              </button>

              <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.6 }}>
                New customer?{" "}
                <Link
                  to="/signup"
                  style={{
                    color: "#0f766e",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  Create your account
                </Link>
              </p>
            </form>
          </div>

          <div
            style={{
              display: "grid",
              gap: "16px",
              padding: "22px",
              borderRadius: "24px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              boxShadow: "0 14px 34px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <p
                style={{
                  margin: 0,
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Shared Workstation
              </p>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "28px",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Staff PIN Access
              </h2>
              <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
                Select your staff account, enter the 4-digit PIN, and continue straight into the
                workspace.
              </p>
            </div>

            <form onSubmit={handleStaffLogin} style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Staff Account</label>
                <select
                  value={selectedStaffUserId}
                  onChange={(event) => {
                    setStaffError("");
                    setSelectedStaffUserId(event.target.value);
                  }}
                  style={inputStyle}
                >
                  {staffOptions.length ? (
                    staffOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))
                  ) : (
                    <option value="">No staff accounts available</option>
                  )}
                </select>
              </div>

              <div>
                <label style={labelStyle}>PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={staffPin}
                  onChange={(event) => {
                    setStaffError("");
                    setStaffPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                  }}
                  placeholder="4-digit PIN"
                  style={inputStyle}
                />
              </div>

              {staffError ? (
                <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{staffError}</p>
              ) : null}

              <button
                type="submit"
                disabled={!staffOptions.length}
                style={{
                  ...buttonStyle,
                  background: staffOptions.length ? "#171717" : "#94a3b8",
                  cursor: staffOptions.length ? "pointer" : "not-allowed",
                }}
              >
                Enter Workspace
              </button>
            </form>
          </div>
        </section>

        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {targetNeedsManagement
            ? "Use email and password sign-in to continue to this page."
            : "Customer sign-in is for portal access. Staff PIN access is for in-shop workflows."}
        </p>
      </section>
    </div>
  );
}
