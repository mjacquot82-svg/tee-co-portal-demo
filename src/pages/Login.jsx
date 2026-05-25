import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  getActiveOperationalStaffUsers,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import { setActiveCustomerSession } from "../lib/customerSessionStore";
import {
  ensureOperationalAuthInitialized,
  getOperationalAuthUser,
  signInToOperationalWorkspace,
  signOutOperationalWorkspace,
  subscribeToOperationalAuth,
} from "../lib/operationalAuthStore";

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #d6d3d1",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "600",
  color: "#292524",
};

const sectionEyebrowStyle = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#78716c",
};

const primaryButtonStyle = {
  width: "100%",
  background: "#171717",
  color: "#ffffff",
  border: "none",
  borderRadius: "14px",
  padding: "14px 18px",
  fontWeight: "700",
  fontSize: "15px",
  cursor: "pointer",
  boxShadow: "0 10px 20px rgba(0,0,0,0.10)",
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffUsers, setStaffUsers] = useState(() => getActiveOperationalStaffUsers());
  const [customerError, setCustomerError] = useState("");
  const [workspaceEmail, setWorkspaceEmail] = useState("");
  const [workspacePassword, setWorkspacePassword] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [activeOperationalUser, setActiveOperationalUser] = useState(() =>
    getOperationalAuthUser()
  );

  const redirectTo = new URLSearchParams(location.search).get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin";

  useEffect(() => {
    function syncStaffUsers(nextUsers) {
      const activeUsers = nextUsers.filter(
        (user) => user.status !== "Inactive" && user.role !== "Owner"
      );
      setStaffUsers(activeUsers);
    }

    syncStaffUsers(getActiveOperationalStaffUsers());
    return subscribeToStaffUsers(syncStaffUsers);
  }, []);

  useEffect(() => {
    void ensureOperationalAuthInitialized().then((snapshot) => {
      setActiveOperationalUser(snapshot.operationalUser);
    });

    return subscribeToOperationalAuth((snapshot) => {
      setActiveOperationalUser(snapshot.operationalUser);
    });
  }, []);

  useEffect(() => {
    if (!activeOperationalUser?.id) return;

    navigate(resolvedRedirectTarget, { replace: true });
  }, [activeOperationalUser, navigate, resolvedRedirectTarget]);

  function handleCustomerLogin(e) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setCustomerError("Enter your email and password to start a new customer session.");
      pushAuthDiagnostic("customer-login-blocked", {
        reason: "missing-credentials",
        emailPresent: Boolean(normalizedEmail),
        passwordPresent: Boolean(normalizedPassword),
      });
      return;
    }

    const startCustomerSession = async () => {
      await signOutOperationalWorkspace();
      clearAllAuthSessions("customer-login-start");
      setActiveCustomerSession({ email: normalizedEmail }, { source: "customer-login" });
      pushAuthDiagnostic("login-redirect", {
        actorType: "customer",
        target: "/my-orders",
      });
      navigate("/my-orders");
    };

    void startCustomerSession();
  }

  async function handleWorkspaceLogin(event) {
    event.preventDefault();
    const normalizedEmail = workspaceEmail.trim();

    if (!normalizedEmail || !workspacePassword) {
      setWorkspaceError("Enter your workspace email and password.");
      return;
    }

    setWorkspaceSubmitting(true);
    setWorkspaceError("");
    clearAllAuthSessions("staff-login-session-reset");

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

    pushAuthDiagnostic("login-redirect", {
      actorType: "staff",
      userId: loginResult.user?.id || "",
      role: loginResult.user?.role || "",
      target: resolvedRedirectTarget,
    });
    navigate(resolvedRedirectTarget, { replace: true });
  }

  return (
    <div
      style={{
        maxWidth: "1040px",
        margin: "0 auto",
        padding: "40px 24px 56px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "24px" }}>
        <p style={{ ...sectionEyebrowStyle, marginBottom: "12px" }}>Tee &amp; Co Access</p>
        <h1
          style={{
            margin: "0 0 10px",
            fontSize: "40px",
            lineHeight: 1.02,
            color: "#1c1917",
            letterSpacing: "-0.03em",
          }}
        >
          One platform, two access points
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "760px",
            color: "#57534e",
            lineHeight: 1.65,
            fontSize: "15px",
          }}
        >
          Customers sign in to their portal for orders and updates. Internal users enter the
          same workspace and the system applies the right operational access after sign-in.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "linear-gradient(145deg, #ffffff 0%, #f5f5f4 100%)",
            borderRadius: "28px",
            padding: "36px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
          }}
        >
          <p style={sectionEyebrowStyle}>Customer Portal</p>

          <h2
            style={{
              marginTop: "10px",
              marginBottom: "10px",
              fontSize: "36px",
              lineHeight: 1.05,
              color: "#1c1917",
            }}
          >
            Sign in to your portal
          </h2>

          <p
            style={{
              marginTop: 0,
              color: "#57534e",
              lineHeight: 1.6,
              marginBottom: "28px",
              maxWidth: "520px",
            }}
          >
            View your order history, track status updates, and respond to payment requests
            from Tee &amp; Co.
          </p>

          <form onSubmit={handleCustomerLogin}>
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setCustomerError("");
                  setEmail(e.target.value);
                }}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setCustomerError("");
                  setPassword(e.target.value);
                }}
                placeholder="Enter password"
                style={inputStyle}
              />
            </div>

            {customerError ? (
              <p style={{ margin: "0 0 14px", color: "#b91c1c", fontWeight: 700 }}>
                {customerError}
              </p>
            ) : null}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "22px",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <Link
                to="/signup"
                style={{
                  color: "#171717",
                  textDecoration: "none",
                  fontWeight: "600",
                  fontSize: "14px",
                }}
              >
                Create account
              </Link>

              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#57534e",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "14px",
                }}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" style={primaryButtonStyle}>
              Sign In
            </button>
          </form>
        </div>

        <div
          style={{
            background: "linear-gradient(180deg, #fffdf8 0%, #ffffff 100%)",
            borderRadius: "28px",
            padding: "30px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 18px 40px rgba(0,0,0,0.05)",
            display: "grid",
            gap: "22px",
            alignContent: "start",
          }}
        >
          <div>
            <p style={sectionEyebrowStyle}>Internal Workspace</p>
            <h2 style={{ margin: "10px 0 8px", fontSize: "26px", color: "#1c1917" }}>
              Workspace sign-in
            </h2>
            <p style={{ margin: 0, color: "#57534e", lineHeight: 1.6 }}>
              Owners and admins enter the operational workspace with their assigned email
              address and password. The current authenticated Supabase user is treated as
              the foundational owner/admin session.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #e7e5e4",
              borderRadius: "22px",
              padding: "22px",
              background: "#ffffff",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
            }}
          >
            <div style={{ marginBottom: "18px" }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#292524" }}>
                Operational access
              </p>
              <p
                style={{
                  margin: 0,
                  color: "#57534e",
                  lineHeight: 1.5,
                  fontSize: "14px",
                }}
              >
                Use your Supabase-authenticated workspace account. Session restore and logout
                are handled automatically for the admin workspace.
              </p>
            </div>

            <form onSubmit={handleWorkspaceLogin}>
              <div style={{ marginBottom: "12px" }}>
                <label style={labelStyle}>Workspace Email</label>
                <input
                  type="email"
                  value={workspaceEmail}
                  onChange={(event) => {
                    setWorkspaceError("");
                    setWorkspaceEmail(event.target.value);
                  }}
                  placeholder="owner@teeandco.com"
                  style={inputStyle}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
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
                <p style={{ margin: "0 0 14px", color: "#b91c1c", fontWeight: 700 }}>
                  {workspaceError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={workspaceSubmitting}
                style={{
                  ...primaryButtonStyle,
                  background: workspaceSubmitting ? "#44403c" : primaryButtonStyle.background,
                  cursor: workspaceSubmitting ? "wait" : "pointer",
                }}
              >
                {workspaceSubmitting ? "Signing In..." : "Enter Workspace"}
              </button>
            </form>

            <p
              style={{
                margin: "14px 0 0",
                color: "#78716c",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {staffUsers.length
                ? `${staffUsers.length} local staff profiles remain available for workflow data, while access control now runs through authenticated Supabase sessions.`
                : "Operational workflow data remains intact while access control is now handled by authenticated Supabase sessions."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
