import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleCustomerLogin(e) {
    e.preventDefault();
    navigate("/my-orders");
  }

  function handleShopLogin() {
    navigate("/admin");
  }

  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          padding: "32px",
          border: "1px solid #e7e5e4",
          boxShadow: "0 14px 30px rgba(0,0,0,0.06)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#78716c",
          }}
        >
          Customer Access
        </p>

        <h1
          style={{
            marginTop: "10px",
            marginBottom: "10px",
            fontSize: "32px",
            lineHeight: 1.1,
          }}
        >
          Sign in to your portal
        </h1>

        <p
          style={{
            marginTop: 0,
            color: "#57534e",
            lineHeight: 1.6,
            marginBottom: "24px",
          }}
        >
          View your order history, track status updates, and respond to payment
          requests from Tee &amp; Co.
        </p>

        <form onSubmit={handleCustomerLogin}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                color: "#292524",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #d6d3d1",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                color: "#292524",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #d6d3d1",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

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

          <button
            type="submit"
            style={{
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
            }}
          >
            Sign In
          </button>
        </form>

        <div
          style={{
            marginTop: "28px",
            paddingTop: "24px",
            borderTop: "1px solid #e7e5e4",
          }}
        >
          <p
            style={{
              margin: "0 0 12px 0",
              fontWeight: "700",
              color: "#292524",
            }}
          >
            Shop team access
          </p>

          <button
            onClick={handleShopLogin}
            style={{
              width: "100%",
              background: "#fafaf9",
              color: "#171717",
              border: "1px solid #d6d3d1",
              borderRadius: "14px",
              padding: "14px 18px",
              fontWeight: "600",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Enter Shop Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}