import { useMemo, useState } from "react";
import { isOwnerView } from "./adminRoleView";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { getRawStorageItem } from "../lib/browserStorage";

const ORDERS_STORAGE_KEY = "teeCoStaffOrders";

const pageStyle = {
  padding: "32px",
  maxWidth: "900px",
};

const panelStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  background: "#ffffff",
  padding: "24px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
};

const mutedTextStyle = {
  color: "#64748b",
  lineHeight: 1.6,
};

const buttonStyle = {
  border: "1px solid #0f172a",
  borderRadius: "6px",
  background: "#0f172a",
  color: "#ffffff",
  fontWeight: 800,
  padding: "10px 14px",
  cursor: "pointer",
};

function getExportDateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRawOrdersExport() {
  const rawOrders = getRawStorageItem(ORDERS_STORAGE_KEY);
  const exportText = rawOrders || "[]";
  const parsedOrders = JSON.parse(exportText);

  if (!Array.isArray(parsedOrders)) {
    throw new Error(`${ORDERS_STORAGE_KEY} does not contain a JSON array.`);
  }

  return {
    exportText,
    orders: parsedOrders,
  };
}

export default function TemporaryOrderExport() {
  const activeStaffUser = getActiveStaffUser();
  const [lastExportCount, setLastExportCount] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const exportSnapshot = useMemo(() => {
    try {
      return readRawOrdersExport();
    } catch (error) {
      return {
        exportText: "",
        orders: [],
        error: error instanceof Error ? error.message : "Unable to read local orders.",
      };
    }
  }, []);

  if (!isOwnerView(activeStaffUser)) {
    return (
      <section style={pageStyle} data-testid="temporary-order-export-denied">
        <div style={panelStyle}>
          <h1 style={{ margin: "0 0 8px", fontSize: "24px" }}>Order Export</h1>
          <p style={mutedTextStyle}>Owner access is required for this temporary export tool.</p>
        </div>
      </section>
    );
  }

  const orderNumbers = exportSnapshot.orders
    .map((order) => String(order?.order_number || "").trim())
    .filter(Boolean);
  const currentError = errorMessage || exportSnapshot.error || "";
  const canExport = !exportSnapshot.error;

  function handleDownload() {
    setErrorMessage("");

    try {
      if (exportSnapshot.error) {
        throw new Error(exportSnapshot.error);
      }

      const blob = new Blob([exportSnapshot.exportText], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tee-co-orders-export-${getExportDateStamp()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setLastExportCount(exportSnapshot.orders.length);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to export local orders.");
      setLastExportCount(null);
    }
  }

  return (
    <section style={pageStyle} data-testid="temporary-order-export-page">
      <div style={panelStyle}>
        <p
          style={{
            margin: "0 0 8px",
            color: "#b45309",
            fontSize: "12px",
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          Temporary migration utility
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "28px" }}>Order Export</h1>
        <p style={{ ...mutedTextStyle, marginTop: 0 }}>
          Downloads the raw <code>{ORDERS_STORAGE_KEY}</code> order array from this browser.
        </p>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "10px 16px",
            margin: "24px 0",
          }}
        >
          <dt style={{ fontWeight: 800 }}>Orders found</dt>
          <dd style={{ margin: 0 }} data-testid="temporary-order-export-count">
            {exportSnapshot.orders.length}
          </dd>
          <dt style={{ fontWeight: 800 }}>Storage key</dt>
          <dd style={{ margin: 0 }}>
            <code>{ORDERS_STORAGE_KEY}</code>
          </dd>
          <dt style={{ fontWeight: 800 }}>Output file</dt>
          <dd style={{ margin: 0 }}>
            <code>{`tee-co-orders-export-${getExportDateStamp()}.json`}</code>
          </dd>
        </dl>

        {orderNumbers.length > 0 ? (
          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "16px" }}>Order numbers</h2>
            <p style={{ ...mutedTextStyle, margin: 0 }} data-testid="temporary-order-export-order-numbers">
              {orderNumbers.join(", ")}
            </p>
          </div>
        ) : null}

        {currentError ? (
          <p
            role="alert"
            style={{
              margin: "0 0 16px",
              color: "#b91c1c",
              fontWeight: 700,
            }}
          >
            {currentError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleDownload}
          disabled={!canExport}
          style={{
            ...buttonStyle,
            opacity: canExport ? 1 : 0.55,
            cursor: canExport ? "pointer" : "not-allowed",
          }}
          data-testid="temporary-order-export-download"
        >
          Download JSON Export
        </button>

        {lastExportCount !== null ? (
          <p
            style={{ margin: "16px 0 0", color: "#166534", fontWeight: 800 }}
            data-testid="temporary-order-export-success"
          >
            Exported {lastExportCount} orders.
          </p>
        ) : null}
      </div>
    </section>
  );
}
