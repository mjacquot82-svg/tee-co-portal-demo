import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { getStoredStaffUsers, validateStaffPin } from "../lib/staffUsersStore";

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

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffUsers] = useState(() => getStoredStaffUsers().filter((user) => user.status !== "Inactive"));
  const [selectedStaffId, setSelectedStaffId] = useState(staffUsers[0]?.id || "");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  function handleCustomerLogin(e) {
    e.preventDefault();
    navigate("/my-orders");
  }

  function handleShopLogin(event) {
    event.preventDefault();

    const selectedUser = staffUsers.find((user) => user.id === selectedStaffId);
    const matchedUser = validateStaffPin(pin);

    if (!selectedUser || !matchedUser || matchedUser.id !== selectedUser.id) {
      setPinError("That PIN does not match the selected staff member.");
      setPin("");
      return;
    }

    window.localStorage.setItem(
      "teeCoActiveStaffUser",
      JSON.stringify({ id: matchedUser.id, name: matchedUser.name, role: matchedUser.role })
    );

    navigate("/admin");
  }

  function addPinDigit(digit) {
    setPinError("");
    setPin((current) => `${current}${digit}`.slice(0, 4));
  }

  function clearPin() {
    setPinError("");
    setPin("");
  }

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "22px", alignItems: "start" }}>
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
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                style={inputStyle}
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
        </div>

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
            Staff Access
          </p>

          <h2 style={{ margin: "10px 0 10px", fontSize: "30px", lineHeight: 1.1 }}>
            Enter shop workspace
          </h2>

          <p style={{ marginTop: 0, color: "#57534e", lineHeight: 1.6, marginBottom: "22px" }}>
            Select your staff profile and enter your PIN to access Central Operations.
          </p>

          <form onSubmit={handleShopLogin}>
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Staff Member</label>
              <select
                value={selectedStaffId}
                onChange={(event) => {
                  setSelectedStaffId(event.target.value);
                  clearPin();
                }}
                style={inputStyle}
              >
                {staffUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.role}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="4"
                value={pin}
                onChange={(event) => {
                  setPinError("");
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                }}
                placeholder="••••"
                style={{ ...inputStyle, textAlign: "center", fontSize: "24px", letterSpacing: "0.25em" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => addPinDigit(digit)}
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    border: "1px solid #d6d3d1",
                    background: "#fafaf9",
                    fontWeight: 800,
                    fontSize: "18px",
                    cursor: "pointer",
                  }}
                >
                  {digit}
                </button>
              ))}
              <button type="button" onClick={clearPin} style={{ padding: "14px", borderRadius: "14px", border: "1px solid #d6d3d1", background: "#ffffff", fontWeight: 800, cursor: "pointer" }}>
                Clear
              </button>
              <button type="button" onClick={() => addPinDigit("0")} style={{ padding: "14px", borderRadius: "14px", border: "1px solid #d6d3d1", background: "#fafaf9", fontWeight: 800, fontSize: "18px", cursor: "pointer" }}>
                0
              </button>
              <button type="submit" style={{ padding: "14px", borderRadius: "14px", border: "1px solid #171717", background: "#171717", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}>
                Enter
              </button>
            </div>

            {pinError && (
              <p style={{ margin: "0 0 14px", color: "#b91c1c", fontWeight: 700 }}>
                {pinError}
              </p>
            )}

            <button
              type="submit"
              disabled={pin.length < 4}
              style={{
                width: "100%",
                background: pin.length === 4 ? "#171717" : "#a8a29e",
                color: "#ffffff",
                border: "none",
                borderRadius: "14px",
                padding: "14px 18px",
                fontWeight: "800",
                fontSize: "15px",
                cursor: pin.length === 4 ? "pointer" : "not-allowed",
              }}
            >
              Enter Shop Dashboard
            </button>
          </form>

          <p style={{ margin: "16px 0 0", color: "#78716c", fontSize: "13px", lineHeight: 1.5 }}>
            Demo default: Owner / Admin uses PIN 1234. Later, staff PINs can be managed from a Staff Users screen.
          </p>
        </div>
      </div>
    </div>
  );
}