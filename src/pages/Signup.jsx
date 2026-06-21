import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ensureCustomerProfile } from "../lib/customerProfileStore";
import {
  getActiveCustomerSession,
  subscribeToActiveCustomerSession,
} from "../lib/customerSessionStore";
import { signUpCustomerAccount } from "../lib/operationalAuthStore";

const fieldStyle = {
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

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeCustomerSession, setActiveCustomerSession] = useState(() =>
    getActiveCustomerSession()
  );
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get("redirectTo");
  const resolvedRedirectTarget =
    redirectTo === "/my-orders" || (redirectTo && redirectTo.startsWith("/portal"))
      ? redirectTo === "/my-orders"
        ? "/portal/orders"
        : redirectTo
      : "/portal/orders";

  useEffect(() => {
    function syncActiveCustomer(nextSession = getActiveCustomerSession()) {
      setActiveCustomerSession(nextSession);
    }

    syncActiveCustomer();

    return subscribeToActiveCustomerSession((nextSession) => {
      syncActiveCustomer(nextSession);
    });
  }, []);

  useEffect(() => {
    if (activeCustomerSession) {
      navigate(resolvedRedirectTarget, { replace: true });
    }
  }, [activeCustomerSession, navigate, resolvedRedirectTarget]);

  function updateField(field, value) {
    setErrorMessage("");
    setSuccessMessage("");
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedEmail = form.email.trim();
    if (!form.firstName.trim() || !form.lastName.trim() || !normalizedEmail || !form.password) {
      setErrorMessage("Complete all required fields.");
      return;
    }

    if (form.password.length < 8) {
      setErrorMessage("Use at least 8 characters for your password.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const signupResult = await signUpCustomerAccount({
      firstName: form.firstName,
      lastName: form.lastName,
      email: normalizedEmail,
      phone: form.phone,
      password: form.password,
    });

    setSubmitting(false);

    if (!signupResult.ok) {
      setErrorMessage(signupResult.message);
      return;
    }

    if (signupResult.customerSession) {
      try {
        await ensureCustomerProfile(signupResult.customerSession);
        navigate(resolvedRedirectTarget, { replace: true });
      } catch (error) {
        console.error("Unable to ensure customer profile after signup", error);
        setErrorMessage(error?.message || "Unable to create your customer profile.");
      }
      return;
    }

    setSuccessMessage(
      signupResult.requiresEmailConfirmation
        ? "Your account was created. Check your email to confirm access, then sign in."
        : "Your account was created. Sign in to open your portal."
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(191, 219, 254, 0.32), transparent 30%), radial-gradient(circle at bottom right, rgba(167, 243, 208, 0.24), transparent 28%), linear-gradient(180deg, #fafaf9 0%, #f8fafc 100%)",
        padding: "40px 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: "28px",
          padding: "34px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
        }}
      >
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
          Customer Portal
        </p>

        <h1
          style={{
            marginTop: "10px",
            marginBottom: "10px",
            fontSize: "34px",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#0f172a",
          }}
        >
          Create your Tee &amp; Co account
        </h1>

        <p
          style={{
            marginTop: 0,
            color: "#475569",
            lineHeight: 1.7,
            marginBottom: "26px",
          }}
        >
          Keep your customer access simple: sign in, review orders, check quotes and invoices,
          and understand where your account stands.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                placeholder="First name"
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                placeholder="Last name"
                style={fieldStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="you@example.com"
              style={fieldStyle}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="Optional"
              style={fieldStyle}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="At least 8 characters"
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
                placeholder="Re-enter password"
                style={fieldStyle}
              />
            </div>
          </div>

          {errorMessage ? (
            <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{successMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              background: submitting ? "#94a3b8" : "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: "16px",
              padding: "15px 18px",
              fontWeight: "800",
              fontSize: "15px",
              cursor: submitting ? "wait" : "pointer",
              boxShadow: "0 14px 28px rgba(15, 23, 42, 0.14)",
            }}
          >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#475569", fontSize: "14px" }}>
            Already have an account?{" "}
            <Link
              to={`/login?redirectTo=${encodeURIComponent(resolvedRedirectTarget)}`}
              style={{
                color: "#0f766e",
                fontWeight: "700",
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
