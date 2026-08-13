import { useEffect, useState } from "react";
import { isSupabaseAuthenticatedOwner } from "./adminRoleView";
import { getOperationalAuthUser } from "../lib/operationalAuthStore";
import {
  createSquareTerminalPairingCode,
  getSquareTerminalPairingStatus,
} from "../services/squareTerminalService";

const pageStyle = { padding: "32px", maxWidth: "840px" };
const panelStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "24px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
};
const buttonStyle = {
  border: 0,
  borderRadius: "8px",
  background: "#0f172a",
  color: "#ffffff",
  fontWeight: 800,
  padding: "12px 18px",
  cursor: "pointer",
};

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
export default function SquareTerminalPairing() {
  const authenticatedUser = getOperationalAuthUser();
  const [registration, setRegistration] = useState(null);
  const [deviceName, setDeviceName] = useState("Tee & Co Front Counter");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const ownerAuthorized = isSupabaseAuthenticatedOwner(authenticatedUser);

  async function loadStatus({ quiet = false } = {}) {
    if (!ownerAuthorized) return;
    if (!quiet) setLoading(true);
    try {
      const next = await getSquareTerminalPairingStatus();
      setRegistration(next);
      setError("");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to load pairing status.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [ownerAuthorized]);

  useEffect(() => {
    if (registration?.status !== "UNPAIRED") return undefined;
    const timer = window.setInterval(() => void loadStatus({ quiet: true }), 3000);
    return () => window.clearInterval(timer);
  }, [registration?.status, ownerAuthorized]);

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      setRegistration(await createSquareTerminalPairingCode(deviceName));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create pairing code.");
    } finally {
      setCreating(false);
    }
  }

  if (!ownerAuthorized) {
    return (
      <section style={pageStyle} data-testid="square-terminal-pairing-denied">
        <div style={panelStyle}>
          <h1 style={{ marginTop: 0 }}>Square Terminal</h1>
          <p>A signed-in Supabase Owner account is required to manage Terminal pairing.</p>
        </div>
      </section>
    );
  }

  const canGenerate = !creating && registration?.status !== "UNPAIRED";

  return (
    <section style={pageStyle} data-testid="square-terminal-pairing-page">
      <div style={panelStyle}>
        <p style={{ margin: "0 0 8px", color: "#1d4ed8", fontWeight: 900, fontSize: "12px", textTransform: "uppercase" }}>
          Square Terminal · Pairing only
        </p>
        <h1 style={{ margin: "0 0 10px", fontSize: "28px" }}>Terminal device pairing</h1>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Generate a short-lived code, enter it on the physical Square Terminal, and keep this page open until the status changes to paired.
        </p>

        {error ? <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p> : null}

        {loading ? <p>Loading pairing status…</p> : registration ? (
          <div style={{ margin: "24px 0", padding: "20px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #cbd5e1" }}>
            <p style={{ marginTop: 0 }}><strong>Status:</strong> {registration.status}</p>
            {registration.status === "UNPAIRED" && registration.pairingCode ? (
              <div>
                <p style={{ marginBottom: "6px", fontWeight: 700 }}>Enter this code on the Terminal:</p>
                <p data-testid="square-terminal-pairing-code" style={{ margin: "0 0 12px", fontSize: "42px", fontWeight: 900, letterSpacing: "0.18em" }}>
                  {registration.pairingCode}
                </p>
                <p style={{ color: "#475569" }}>Pair before {formatTime(registration.pairBy)}. Status refreshes automatically.</p>
              </div>
            ) : null}
            {registration.status === "PAIRED" ? (
              <div data-testid="square-terminal-paired">
                <p><strong>Device:</strong> {registration.deviceName}</p>
                <p><strong>Square device ID:</strong> {registration.squareDeviceId}</p>
                <p><strong>Paired:</strong> {formatTime(registration.pairedAt)}</p>
              </div>
            ) : null}
            {registration.status === "EXPIRED" ? <p>The last code expired before pairing. Generate a new code.</p> : null}
            <p style={{ marginBottom: 0, color: "#64748b", fontSize: "13px" }}>
              Square location: {registration.squareLocationId}
            </p>
          </div>
        ) : <p style={{ color: "#475569" }}>No Terminal pairing registration exists yet.</p>}

        <label style={{ display: "grid", gap: "8px", marginBottom: "14px", fontWeight: 700 }}>
          Device name
          <input
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            maxLength={64}
            disabled={!canGenerate}
            style={{ maxWidth: "420px", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: "8px" }}
          />
        </label>
        <button type="button" style={{ ...buttonStyle, opacity: canGenerate ? 1 : 0.55 }} disabled={!canGenerate} onClick={handleCreate}>
          {creating ? "Generating…" : registration?.status === "EXPIRED" ? "Generate new pairing code" : "Generate pairing code"}
        </button>
        <p style={{ marginBottom: 0, color: "#64748b", fontSize: "13px" }}>
          This phase pairs the device only. It does not send checkouts or collect payments.
        </p>
      </div>
    </section>
  );
}
