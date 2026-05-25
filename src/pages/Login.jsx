import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const [activeOperationalUser, setActiveOperationalUser] = useState(() =>
    getOperationalAuthUser()
  );

  const redirectTo = new URLSearchParams(location.search).get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin";

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
          "radial-gradient(circle at top left, rgba(226, 232, 240, 0.78), transparent 34%), linear-gradient(180deg, #fafaf9 0%, #f5f5f4 100%)",
        padding: "40px 24px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "460px",
          margin: "0 auto",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderRadius: "28px",
          border: "1px solid #e2e8f0",
          padding: "32px",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.07)",
          display: "grid",
          gap: "22px",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
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
              lineHeight: 1.6,
            }}
          >
            Use your owner or admin account to open the workspace.
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
            <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{workspaceError}</p>
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

          <p
            style={{
              margin: "2px 0 0",
              color: "#64748b",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Staff PIN switching is available inside the workspace.
          </p>
        </form>
      </section>
    </div>
  );
}
