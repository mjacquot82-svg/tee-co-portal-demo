import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  canAccessOwnerWorkspace,
  isAdminWorkspaceView,
  requiresProtectedManagementAccess,
} from "../admin/adminRoleView";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { clearAllAuthSessions } from "../lib/authSessionStore";
import {
  ensureOperationalAuthInitialized,
  getOperationalAuthUser,
  isOperationalAuthLoading,
  signInToOperationalWorkspace,
  signOutOperationalWorkspace,
  subscribeToOperationalAuth,
} from "../lib/operationalAuthStore";
import {
  attemptStaffLogin,
  getActiveOperationalStaffUsers,
  getActiveStaffUser,
  subscribeToActiveStaffUser,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";

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
  const [staffOptions, setStaffOptions] = useState(() => getActiveOperationalStaffUsers());
  const [selectedStaffUserId, setSelectedStaffUserId] = useState(() => getActiveOperationalStaffUsers()[0]?.id || "");
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

  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin";
  const targetNeedsManagement = requiresProtectedManagementAccess(resolvedRedirectTarget);

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
    function syncStaffOptions(nextUsers = getActiveOperationalStaffUsers()) {
      const activeUsers = nextUsers.filter(
        (user) => user.status !== "Inactive" && user.role !== "Owner"
      );
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
    if (operationalAuthLoading) return;

    if (targetNeedsManagement) {
      if (!isAdminWorkspaceView(activeOperationalUser)) return;
      navigate(resolvedRedirectTarget, { replace: true });
      return;
    }

    if (!activeStaffUser?.id) return;
    navigate(resolvedRedirectTarget, { replace: true });
  }, [
    activeOperationalUser,
    activeStaffUser,
    navigate,
    operationalAuthLoading,
    resolvedRedirectTarget,
    targetNeedsManagement,
  ]);

  function handleStaffLogin(event) {
    event.preventDefault();

    if (!selectedStaffUserId) {
      setStaffError("Select an operator.");
      return;
    }

    if (String(staffPin).replace(/\D/g, "").length !== 4) {
      setStaffError("Enter the 4-digit PIN.");
      return;
    }

    clearAllAuthSessions("staff-login-session-reset");

    const loginResult = attemptStaffLogin({
      staffUserId: selectedStaffUserId,
      pin: staffPin,
      persistSession: true,
    });

    if (!loginResult.ok) {
      setStaffError(loginResult.message);
      setStaffPin("");
      return;
    }

    if (targetNeedsManagement) {
      setStaffError("Use account sign-in below to open this page.");
      setStaffPin("");
      return;
    }

    pushAuthDiagnostic("login-redirect", {
      actorType: "staff",
      userId: loginResult.user?.id || "",
      role: loginResult.user?.role || "",
      target: targetNeedsManagement ? "/admin" : resolvedRedirectTarget,
    });

    navigate(targetNeedsManagement ? "/admin" : resolvedRedirectTarget, { replace: true });
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

    const nextTarget = canAccessOwnerWorkspace(resolvedRedirectTarget, loginResult.user)
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
            Sign in
          </h1>
          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: "15px",
              lineHeight: 1.6,
            }}
          >
            Use a PIN for quick workstation access or sign in with your account. We&apos;ll open the
            right workspace for you.
          </p>
        </div>

        <section
          style={{
            display: "grid",
            gap: "18px",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "18px",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
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
                Quick Access
              </p>
              <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
                Choose the operator at this station and enter the 4-digit PIN.
              </p>
            </div>

            <form onSubmit={handleStaffLogin} style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Operator</label>
                <select
                  value={selectedStaffUserId}
                  onChange={(event) => {
                    setStaffError("");
                    setSelectedStaffUserId(event.target.value);
                  }}
                  style={inputStyle}
                >
                  {staffOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
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
                  boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)",
                }}
              >
                Continue with PIN
              </button>
            </form>
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "18px",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
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
                Account Sign-In
              </p>
              <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
                Use your email and password for personal access, protected tools, or account-based
                work.
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
                  placeholder="you@teeandco.com"
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
                  boxShadow: "none",
                }}
              >
                {workspaceSubmitting ? "Signing In..." : "Continue with Account"}
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
            ? "This page needs an account sign-in."
            : "PIN keeps shared workstations moving. Account sign-in follows you across sessions."}
        </p>
      </section>
    </div>
  );
}
