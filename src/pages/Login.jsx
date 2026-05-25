import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getActiveOperationalStaffUsers, subscribeToStaffUsers } from "../lib/staffUsersStore";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import {
  ensureOperationalAuthInitialized,
  getOperationalAuthUser,
  signInToOperationalWorkspace,
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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaceEmail, setWorkspaceEmail] = useState("");
  const [workspacePassword, setWorkspacePassword] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [staffCount, setStaffCount] = useState(() => getActiveOperationalStaffUsers().length);
  const [activeOperationalUser, setActiveOperationalUser] = useState(() =>
    getOperationalAuthUser()
  );

  const redirectTo = new URLSearchParams(location.search).get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin";

  useEffect(() => {
    function syncStaffCount(nextUsers = getActiveOperationalStaffUsers()) {
      setStaffCount(nextUsers.length);
    }

    syncStaffCount();
    return subscribeToStaffUsers((nextUsers) => {
      syncStaffCount(nextUsers.filter((user) => user.status !== "Inactive" && user.role !== "Owner"));
    });
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
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(226, 232, 240, 0.9), transparent 38%), linear-gradient(180deg, #f8fafc 0%, #f5f5f4 100%)",
        padding: "40px 24px 56px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1040px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <section
          style={{
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            borderRadius: "28px",
            border: "1px solid #e2e8f0",
            padding: "34px",
            boxShadow: "0 20px 45px rgba(15, 23, 42, 0.07)",
            display: "grid",
            gap: "24px",
          }}
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <p
              style={{
                margin: 0,
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
                margin: 0,
                color: "#0f172a",
                fontSize: "40px",
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
              }}
            >
              Sign in to the workspace
            </h1>
            <p
              style={{
                margin: 0,
                color: "#475569",
                fontSize: "15px",
                lineHeight: 1.65,
                maxWidth: "560px",
              }}
            >
              Use your authenticated owner or admin account to open the operational workspace.
              Staff PIN switching stays available inside the workspace for quick handoffs on
              shared stations.
            </p>
          </div>

          <form onSubmit={handleWorkspaceLogin} style={{ display: "grid", gap: "14px" }}>
            <div>
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
              <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                {workspaceError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={workspaceSubmitting}
              style={{
                ...buttonStyle,
                background: workspaceSubmitting ? "#334155" : "#171717",
                cursor: workspaceSubmitting ? "wait" : "pointer",
              }}
            >
              {workspaceSubmitting ? "Signing In..." : "Enter Workspace"}
            </button>
          </form>
        </section>

        <aside
          style={{
            background: "#ffffff",
            borderRadius: "28px",
            border: "1px solid #e2e8f0",
            padding: "30px",
            boxShadow: "0 20px 45px rgba(15, 23, 42, 0.05)",
            display: "grid",
            gap: "16px",
            alignContent: "start",
          }}
        >
          <div
            style={{
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "18px",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                color: "#0f172a",
                fontSize: "15px",
                fontWeight: 800,
              }}
            >
              After sign-in
            </p>
            <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
              The authenticated session stays active in the background. Inside the workspace,
              staff can switch operational identity with a 4-digit PIN for faster shared-terminal
              use.
            </p>
          </div>

          <div
            style={{
              borderRadius: "18px",
              background: "#fffdf8",
              border: "1px solid #e7e5e4",
              padding: "18px",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                color: "#0f172a",
                fontSize: "15px",
                fontWeight: 800,
              }}
            >
              Operational setup
            </p>
            <p style={{ margin: "0 0 10px", color: "#57534e", fontSize: "14px", lineHeight: 1.6 }}>
              {staffCount
                ? `${staffCount} active staff profile${staffCount === 1 ? "" : "s"} ready for PIN-based workstation switching.`
                : "Staff profiles can still be managed inside the workspace when you need them."}
            </p>
            <p style={{ margin: 0, color: "#78716c", fontSize: "13px", lineHeight: 1.5 }}>
              Use this screen for real workspace authentication only.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
