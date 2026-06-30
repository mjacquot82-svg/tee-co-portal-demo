import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { formatShortDate } from "../lib/dateFormatting";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { isQuoteArchived } from "../quotes/quoteWorkflow";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { canManageArchivedQuotes, getAdminViewer } from "./adminRoleView";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function buildArchivedQuotes(orders) {
  return orders
    .filter((order) => isQuoteArchived(order))
    .map((order) => ({
      ...order,
      total: normalizeOrderFinancials(order).total_amount,
    }))
    .sort((left, right) =>
      String(right.quote_archived_at || right.updated_at || "").localeCompare(
        String(left.quote_archived_at || left.updated_at || "")
      )
    );
}

export default function ArchivedQuotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const viewer = getAdminViewer(getActiveStaffUser());
  const canManageArchive = canManageArchivedQuotes(viewer);
  const orders = useStoredOrders();
  const archivedQuotes = useMemo(() => buildArchivedQuotes(orders), [orders]);
  const [flashMessage, setFlashMessage] = useState(() => location.state?.flashMessage || "");
  const [flashTone, setFlashTone] = useState(() => location.state?.flashTone || "default");

  useEffect(() => {
    if (!location.state?.flashMessage) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!flashMessage) return;

    const flashTimer = window.setTimeout(() => {
      setFlashMessage("");
    }, 5000);

    return () => window.clearTimeout(flashTimer);
  }, [flashMessage]);

  async function handleRestoreQuote(quote) {
    if (!canManageArchive) return;

    const confirmed = window.confirm(
      `Restore request ${quote.order_number} to the active review workflow? It will leave Archived Requests and become visible again.`
    );
    if (!confirmed) return;

    await updateStoredOrder(quote.order_number, {
      quote_archived: false,
      quote_archived_at: null,
      activity_type: "quote_restore",
      activity_note: "Request restored to active review workflow.",
    });

    setFlashTone("success");
    setFlashMessage(`Request ${quote.order_number} was restored to the active review workflow.`);
    navigate(`/admin/quotes/${quote.order_number}`, {
      state: {
        flashMessage: `Request ${quote.order_number} was restored to active review workflow.`,
        flashTone: "success",
      },
    });
  }

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Records Archive
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Archived Requests</h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: "760px", lineHeight: 1.6 }}>
            Historical request records live here after removal from active review. Restore actions remain visible so archive management stays reversible. Canceled records are tracked separately so termination and archiving stay distinct.
          </p>
        </div>

        <Link
          to="/admin/quotes"
          style={{
            background: "#ffffff",
            color: "#171717",
            border: "1px solid #d6dbe4",
            borderRadius: "12px",
            padding: "12px 16px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          View Active Requests
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <article
          style={{
            background: "#f8fafc",
            border: "1px solid #d8e1ea",
            borderRadius: "18px",
            padding: "18px",
          }}
        >
          <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>Archived Records</p>
          <h2 style={{ margin: "8px 0 0", color: "#0f172a" }}>{archivedQuotes.length}</h2>
        </article>
      </section>

      {flashMessage ? (
        <section
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "18px",
            padding: "16px 18px",
            border: flashTone === "success" ? "1px solid #cbd5e1" : "1px solid #cbd5e1",
            background: flashTone === "success" ? "#f8fafc" : "#f8fafc",
            color: "#334155",
            fontWeight: 700,
          }}
        >
          {flashMessage}
        </section>
      ) : null}

      <section
        style={{
          background: "#f8fafc",
          borderRadius: "20px",
          padding: "22px",
          border: "1px solid #d8e1ea",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 1fr) minmax(180px, 1.6fr) minmax(140px, 1fr) minmax(120px, 1fr) minmax(150px, 1fr) auto",
            gap: "12px",
            padding: "0 4px 12px",
            borderBottom: "1px solid #d8e1ea",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Request #</span>
          <span>Customer</span>
          <span>Archived Date</span>
          <span>Total</span>
          <span>Status</span>
          <span>Record</span>
        </div>

        <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
          {archivedQuotes.length ? (
            archivedQuotes.map((quote) => (
              <article
                key={quote.order_number}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1fr) minmax(180px, 1.6fr) minmax(140px, 1fr) minmax(120px, 1fr) minmax(150px, 1fr) auto",
                  gap: "12px",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <strong style={{ color: "#0f172a" }}>{quote.order_number || "—"}</strong>
                <span style={{ color: "#334155", fontWeight: 600 }}>
                  {quote.customer_name || "Walk-in Customer"}
                </span>
                <span style={{ color: "#475569" }}>
                  {formatShortDate(quote.quote_archived_at || quote.updated_at)}
                </span>
                <strong style={{ color: "#0f172a" }}>{money(quote.total)}</strong>
                <span style={{ color: "#475569", fontWeight: 600 }}>
                  {quote.quote_status || "Archived"}
                </span>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifySelf: "start" }}>
                  {canManageArchive ? (
                    <button
                      type="button"
                      onClick={() => handleRestoreQuote(quote)}
                      style={{
                        border: "1px solid #d6dbe4",
                        background: "#f8fafc",
                        color: "#0f172a",
                        borderRadius: "12px",
                        padding: "10px 12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Restore Request
                    </button>
                  ) : null}
                  <Link
                    to={`/admin/quotes/${quote.order_number}`}
                    style={{
                      alignSelf: "center",
                      color: "#0f172a",
                      textDecoration: "none",
                      fontWeight: 800,
                    }}
                  >
                    View
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: "18px",
                padding: "28px",
                color: "#64748b",
                background: "#ffffff",
              }}
            >
              No archived requests yet. Active request review remains separate until records are intentionally archived.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
