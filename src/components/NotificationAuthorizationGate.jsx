import { useState } from "react";
import { Link } from "react-router-dom";
import {
  satisfiesSupabaseRouteAuthorization,
} from "../admin/adminRoleView";
import { pushAuthDiagnostic } from "../lib/authDiagnostics";
import { signInToOperationalWorkspace } from "../lib/operationalAuthStore";

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  fontSize: "15px",
};

export default function NotificationAuthorizationGate({
  requirement,
  pathname,
  operationalUser,
  pinUser,
  children,
}) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (
    !requirement ||
    satisfiesSupabaseRouteAuthorization(operationalUser, requirement)
  ) {
    return children;
  }

  const ownerRequired = requirement === "owner";
  const verificationLabel = ownerRequired ? "Verify as Owner" : "Verify operational access";

  async function handleVerify(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter the Supabase account email and password.");
      return;
    }

    setSubmitting(true);
    setError("");
    const result = await signInToOperationalWorkspace({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    setPassword("");

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (!satisfiesSupabaseRouteAuthorization(result.user, requirement)) {
      setError(
        ownerRequired
          ? "This Supabase account is not authorized as an Owner. Ask a Supabase administrator to set app_metadata.operational_role to owner."
          : "This Supabase account is not authorized for operational access."
      );
      pushAuthDiagnostic("notification-authorization-rejected", {
        pathname,
        requiredRole: requirement,
        resolvedRole: result.user?.role || "",
        userId: result.user?.id || "",
      });
      return;
    }

    pushAuthDiagnostic("notification-authorization-succeeded", {
      pathname,
      requiredRole: requirement,
      resolvedRole: result.user?.role || "",
      userId: result.user?.id || "",
      preservedPinSessionUserId: pinUser?.id || "",
    });
  }

  return (
    <section
      data-testid="notification-authorization-gate"
      style={{
        maxWidth: "640px",
        margin: "48px auto",
        padding: "28px",
        border: "1px solid #dbeafe",
        borderRadius: "22px",
        background: "#ffffff",
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
        display: "grid",
        gap: "18px",
      }}
    >
      <div>
        <p style={{ margin: "0 0 6px", color: "#0369a1", fontWeight: 900, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Protected notification administration
        </p>
        <h1 style={{ margin: "0 0 10px", color: "#0f172a" }}>
          {ownerRequired
            ? "Notification administration requires Owner verification."
            : "Notification Activity requires operational verification."}
        </h1>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
          Your operational session is still active
          {pinUser?.name ? ` as ${pinUser.name}` : ""}.{" "}
          {ownerRequired
            ? "Owner verification is required for this protected area."
            : "A server-verified operational account is required to read protected activity records."}
        </p>
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            border: 0,
            borderRadius: "12px",
            padding: "12px 16px",
            background: "#0f172a",
            color: "#ffffff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {verificationLabel}
        </button>
      ) : (
        <form onSubmit={handleVerify} style={{ display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "7px", fontWeight: 800 }}>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: "7px", fontWeight: 800 }}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              style={inputStyle}
            />
          </label>
          {error ? <p role="alert" style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            style={{
              border: 0,
              borderRadius: "12px",
              padding: "12px 16px",
              background: submitting ? "#94a3b8" : "#0f172a",
              color: "#ffffff",
              fontWeight: 800,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Verifying…" : verificationLabel}
          </button>
        </form>
      )}

      <Link to="/admin" style={{ color: "#0f766e", fontWeight: 800 }}>
        Return to dashboard
      </Link>
    </section>
  );
}
