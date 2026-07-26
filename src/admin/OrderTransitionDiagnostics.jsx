import { useMemo, useState } from "react";
import { restoreOrderTransitionDiagnostics } from "../lib/orderTransitionDiagnostics";

const STORAGE_KEY = "teeCoOrderTransitionDiagnostics";

export default function OrderTransitionDiagnostics() {
  const [entries, setEntries] = useState(() => restoreOrderTransitionDiagnostics());
  const [orderNumber, setOrderNumber] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const filteredEntries = useMemo(() => {
    const normalizedOrderNumber = orderNumber.trim().toLowerCase();
    return normalizedOrderNumber
      ? entries.filter(
          (entry) =>
            String(entry.order_number || "").trim().toLowerCase() === normalizedOrderNumber
        )
      : entries;
  }, [entries, orderNumber]);
  const output = JSON.stringify(filteredEntries, null, 2);

  function refresh() {
    setEntries([...restoreOrderTransitionDiagnostics()]);
    setCopyStatus("");
  }

  function clear() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
    setEntries([]);
    setCopyStatus("Diagnostics cleared.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy was blocked. Select the JSON below and copy it manually.");
    }
  }

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px", display: "grid", gap: "18px" }}>
      <header>
        <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>Temporary Diagnostics</p>
        <h1 style={{ margin: "6px 0" }}>Order Transition Trace</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          This page displays diagnostics captured in this browser tab for the Ready For Production workflow.
        </p>
      </header>

      <section style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "end" }}>
        <label style={{ display: "grid", gap: "6px", fontWeight: 800 }}>
          Order number
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="TC-######"
            style={{ minWidth: "220px", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "10px" }}
          />
        </label>
        <button type="button" onClick={refresh}>Refresh</button>
        <button type="button" onClick={copy}>Copy JSON</button>
        <button type="button" onClick={clear}>Clear diagnostics</button>
        <strong>{filteredEntries.length} matching events</strong>
      </section>

      {copyStatus ? <p style={{ margin: 0, fontWeight: 700 }}>{copyStatus}</p> : null}

      <textarea
        aria-label="Order transition diagnostics JSON"
        readOnly
        value={output}
        style={{
          width: "100%",
          minHeight: "520px",
          boxSizing: "border-box",
          padding: "16px",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "monospace",
          fontSize: "13px",
          lineHeight: 1.5,
        }}
      />
    </main>
  );
}
