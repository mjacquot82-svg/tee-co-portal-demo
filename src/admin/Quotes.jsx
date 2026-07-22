import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { getJsonStorageItem, setJsonStorageItem } from "../lib/browserStorage";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import {
  canAdvanceQuoteStatus,
  getNextQuoteStatus,
  isActiveQuoteWorkflowOrder,
  sortQuotesByStatus,
} from "../quotes/quoteWorkflow";
import {
  buildQuoteSummary,
  matchesQuoteQueueFilter,
} from "../quotes/requestQueueReadiness";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import {
  canManageArchivedQuotes,
  getAdminViewer,
  isStaffWorkspaceView,
} from "./adminRoleView";
import { buildQuoteEmptyState } from "./workflowCopy";

const EXPANDED_QUOTES_STORAGE_KEY = "teeCoQuotesExpandedState";
const QUOTE_QUEUE_FILTERS = [
  { key: "all", label: "All Requests" },
  { key: "awaiting-approval", label: "Awaiting Customer" },
  { key: "awaiting-artwork", label: "Awaiting Artwork" },
  { key: "awaiting-deposit", label: "Awaiting Deposit" },
  { key: "ready", label: "Ready for Production" },
  { key: "blocked", label: "Blocked" },
];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatValue(value, fallback = "—") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatList(values = [], fallback = "—") {
  const items = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  return items.length ? items.join(", ") : fallback;
}

function readExpandedQuotesState() {
  const storedState = getJsonStorageItem(EXPANDED_QUOTES_STORAGE_KEY, {});
  if (!storedState || typeof storedState !== "object" || Array.isArray(storedState)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(storedState).filter(([, value]) => typeof value === "boolean")
  );
}

function FilterPill({ active, children, count, tone = "default", onClick }) {
  const activeBackground =
    tone === "warning"
      ? "#9a3412"
      : tone === "success"
      ? "#166534"
      : "#111827";
  const inactiveBackground = tone === "warning" ? "#fff7ed" : "#ffffff";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? `1px solid ${activeBackground}` : "1px solid #d6dbe4",
        background: active ? activeBackground : inactiveBackground,
        color: active ? "#ffffff" : "#111827",
        borderRadius: "999px",
        padding: "8px 11px",
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        whiteSpace: "nowrap",
      }}
    >
      <span>{children}</span>
      <span
        style={{
          minWidth: "20px",
          height: "20px",
          padding: "0 6px",
          borderRadius: "999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          background: active ? "rgba(255,255,255,0.16)" : "#f1f5f9",
          color: active ? "#ffffff" : "#475569",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function Field({ label, value, tone = "default" }) {
  const tones = {
    default: { label: "#64748b", value: "#0f172a" },
    warning: { label: "#9a3412", value: "#7c2d12" },
    success: { label: "#166534", value: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          margin: 0,
          color: palette.label,
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <strong
        style={{
          display: "block",
          marginTop: "6px",
          color: palette.value,
          fontSize: "14px",
          lineHeight: 1.4,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function StatusPill({ children, tone = "default" }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: "999px",
        padding: "7px 11px",
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontWeight: 800,
        fontSize: "12px",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function ExpandIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 180ms ease",
      }}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildReadinessSummary(readiness) {
  if (readiness.ready) return "Ready for production";

  return `${readiness.remainingRequirements} requirement${readiness.remainingRequirements === 1 ? "" : "s"} remaining`;
}

function getCollapsedSummaryFields(quote, summary) {
  return [
    { label: "Request #", value: formatValue(quote.order_number) },
    { label: "Customer", value: formatValue(quote.customer_name, "Walk-in Customer") },
    { label: "Status", value: formatValue(quote.quote_status, "Draft") },
    {
      label: "Production readiness",
      value: buildReadinessSummary(summary.readiness),
      tone: summary.readiness.ready ? "success" : "warning",
    },
    {
      label: "Deposit status",
      value: summary.depositStatus,
      tone: summary.depositStatus === "Deposit received" ? "success" : "warning",
    },
    { label: "Due date", value: summary.dueDate },
    { label: "Total", value: money(summary.total) },
  ];
}

function buildQuoteSearchableText(quote, summary) {
  return [
    quote.order_number,
    quote.customer_name,
    quote.company,
    quote.garment,
    quote.decoration_type,
    quote.quote_status,
    summary.approvalStatus,
    summary.depositStatus,
    summary.dueDate,
    summary.decorationSummary,
    summary.placementSummary,
    ...summary.artworkNames,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export default function Quotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const staffUser = getActiveStaffUser();
  const viewer = getAdminViewer(staffUser);
  const isStaffWorkspace = isStaffWorkspaceView(staffUser);
  const canViewArchivedQuotes = canManageArchivedQuotes(viewer);
  const orders = useStoredOrders();
  const cardRefs = useRef({});
  const [expandedQuotes, setExpandedQuotes] = useState(readExpandedQuotesState);
  const [flashTitle, setFlashTitle] = useState(() => location.state?.flashTitle || "Request Created Successfully");
  const [flashMessage, setFlashMessage] = useState(() => location.state?.flashMessage || "");
  const [flashTone, setFlashTone] = useState(() => location.state?.flashTone || "default");
  const [highlightedQuote, setHighlightedQuote] = useState(
    () => location.state?.createdOrderNumber || ""
  );
  const activeQueueFilter = searchParams.get("queue") || "all";
  const searchTerm = searchParams.get("q") || "";
  const quotes = useMemo(
    () => sortQuotesByStatus(orders.filter((order) => isActiveQuoteWorkflowOrder(order))),
    [orders]
  );
  const quoteRecords = useMemo(
    () =>
      quotes.map((quote) => {
        const summary = buildQuoteSummary(quote);
        return {
          quote,
          summary,
          searchText: buildQuoteSearchableText(quote, summary),
        };
      }),
    [quotes]
  );
  const filterCounts = useMemo(
    () =>
      QUOTE_QUEUE_FILTERS.reduce((counts, filter) => {
        counts[filter.key] = quoteRecords.filter(({ quote, summary }) =>
          matchesQuoteQueueFilter(quote, summary, filter.key)
        ).length;
        return counts;
      }, {}),
    [quoteRecords]
  );
  const filteredQuoteRecords = useMemo(() => {
    const normalizedSearchTerm = String(searchTerm || "").trim().toLowerCase();

    return quoteRecords.filter(({ quote, summary, searchText }) => {
      if (!matchesQuoteQueueFilter(quote, summary, activeQueueFilter)) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return searchText.includes(normalizedSearchTerm);
    });
  }, [activeQueueFilter, quoteRecords, searchTerm]);
  const hasActiveFilters = activeQueueFilter !== "all" || Boolean(searchTerm);

  useEffect(() => {
    const activeOrderNumbers = new Set(quotes.map((quote) => quote.order_number));

    queueMicrotask(() => {
      setExpandedQuotes((current) => {
        const nextState = Object.fromEntries(
          Object.entries(current).filter(([orderNumber]) => activeOrderNumbers.has(orderNumber))
        );

        return Object.keys(nextState).length === Object.keys(current).length ? current : nextState;
      });
    });
  }, [quotes]);

  useEffect(() => {
    setJsonStorageItem(EXPANDED_QUOTES_STORAGE_KEY, expandedQuotes);
  }, [expandedQuotes]);

  useEffect(() => {
    if (!location.state?.createdOrderNumber && !location.state?.flashMessage) return;

    const stateTimer = window.setTimeout(() => {
      if (location.state?.flashMessage) {
        setFlashTitle(location.state.flashTitle || "Request Created Successfully");
        setFlashMessage(location.state.flashMessage);
        setFlashTone(location.state.flashTone || "default");
      }

      if (location.state?.createdOrderNumber) {
        setHighlightedQuote(location.state.createdOrderNumber);
      }
    }, 0);

    navigate(location.pathname, { replace: true, state: null });
    return () => window.clearTimeout(stateTimer);
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!highlightedQuote) return;
    if (!quotes.some((quote) => quote.order_number === highlightedQuote)) return;

    window.requestAnimationFrame(() => {
      setExpandedQuotes((current) => ({
        ...current,
        [highlightedQuote]: true,
      }));
    });

    const scrollToQuote = () => {
      cardRefs.current[highlightedQuote]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    };

    window.requestAnimationFrame(scrollToQuote);

    const highlightTimer = window.setTimeout(() => {
      setHighlightedQuote("");
    }, 5000);

    return () => window.clearTimeout(highlightTimer);
  }, [highlightedQuote, quotes]);

  useEffect(() => {
    if (!flashMessage) return;

    const flashTimer = window.setTimeout(() => {
      setFlashMessage("");
    }, 5000);

    return () => window.clearTimeout(flashTimer);
  }, [flashMessage]);

  function toggleQuote(orderNumber) {
    setExpandedQuotes((current) => ({
      ...current,
      [orderNumber]: !current[orderNumber],
    }));
  }

  function updateFilters(nextValues) {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value || (key === "queue" && value === "all")) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    setSearchParams(nextParams);
  }

  function setVisibleQuotesExpanded(expanded) {
    const visibleOrderNumbers = filteredQuoteRecords.map(({ quote }) => quote.order_number);
    if (!visibleOrderNumbers.length) return;

    setExpandedQuotes((current) => {
      const nextState = { ...current };
      visibleOrderNumbers.forEach((orderNumber) => {
        nextState[orderNumber] = expanded;
      });
      return nextState;
    });
  }

  async function handleArchiveQuote(quote) {
    if (!canViewArchivedQuotes) return;

    const confirmed = window.confirm(
      `Archive request ${quote.order_number} from active review? It will move to Archived Requests and stay recoverable.`
    );
    if (!confirmed) return;

    await updateStoredOrder(quote.order_number, {
      quote_archived: true,
      quote_archived_at: new Date().toISOString(),
      operational_visible: false,
      production_ready: false,
      activity_type: "quote_archive",
      activity_note: "Quote archived from active workflow.",
    });

    setFlashTitle("Request Archived");
    setFlashMessage(`Request ${quote.order_number} was removed from active review and moved to Archived Requests.`);
    setFlashTone("success");
    setHighlightedQuote("");
    setExpandedQuotes((current) => {
      if (!current[quote.order_number]) return current;

      const nextState = { ...current };
      delete nextState[quote.order_number];
      return nextState;
    });
  }

  async function handleReleaseToProduction(quote, summary) {
    if (!summary.readiness.ready) return;

    await updateStoredOrder(quote.order_number, {
      quote_status: "Ready For Production",
      status: "Awaiting Production",
      operational_visible: true,
      production_ready: true,
      activity_type: "release_to_production",
      activity_note: "Quote released into Production Orders.",
    });

    navigate(`/admin/orders/${quote.order_number}`, {
      state: {
        flashMessage: `Order Moved to Production for ${quote.order_number} · ${quote.customer_name || "Customer"}`,
        flashTone: "success",
      },
    });
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
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
            Order Requests
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Order Requests</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
            {isStaffWorkspace
              ? "Incoming request work, approvals, and artwork readiness stay here until jobs move into production."
              : "Intake, approvals, artwork sign-off, and deposit readiness stay here until work is released into production."}
          </p>
          <p style={{ margin: "8px 0 0", color: "#94a3b8", maxWidth: "760px", fontSize: "14px", fontWeight: 600 }}>
            {canViewArchivedQuotes
              ? "Archived requests are intentionally removed from this active review view and remain available in Archived Requests."
              : "Archived requests are intentionally removed from this active workflow view."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {canViewArchivedQuotes ? (
            <Link
              to="/admin/quotes/archived"
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
              Archived Requests
            </Link>
          ) : null}
          <Link
            to="/admin/quotes/new"
            style={{
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "12px 16px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {isStaffWorkspace ? "New Intake" : "New Order Request"}
          </Link>
        </div>
      </div>

      <section
        data-testid="order-request-filter-bar"
        aria-label="Filter order requests"
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "18px 20px",
          border: "1px solid #e8edf3",
          display: "grid",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {QUOTE_QUEUE_FILTERS.map((filter) => (
            <FilterPill
              key={filter.key}
              active={activeQueueFilter === filter.key}
              count={filterCounts[filter.key] || 0}
              tone={
                filter.key === "ready"
                  ? "success"
                  : filter.key === "awaiting-approval" ||
                    filter.key === "awaiting-artwork" ||
                    filter.key === "awaiting-deposit" ||
                    filter.key === "blocked"
                  ? "warning"
                  : "default"
              }
              onClick={() => updateFilters({ queue: filter.key })}
            >
              {filter.label}
            </FilterPill>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => updateFilters({ q: event.target.value })}
            placeholder="Search request, customer, garment, artwork, status"
            style={{
              flex: "1 1 360px",
              minWidth: "240px",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "11px 12px",
            }}
          />
          <button
            type="button"
            onClick={() => setVisibleQuotesExpanded(true)}
            disabled={!filteredQuoteRecords.length}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: filteredQuoteRecords.length ? "pointer" : "not-allowed",
              opacity: filteredQuoteRecords.length ? 1 : 0.6,
            }}
          >
            Expand Visible
          </button>
          <button
            type="button"
            onClick={() => setVisibleQuotesExpanded(false)}
            disabled={!filteredQuoteRecords.length}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: filteredQuoteRecords.length ? "pointer" : "not-allowed",
              opacity: filteredQuoteRecords.length ? 1 : 0.6,
            }}
          >
            Collapse Visible
          </button>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams())}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Reset
            </button>
          ) : null}
          <strong style={{ color: "#475569" }}>{filteredQuoteRecords.length} visible</strong>
        </div>
      </section>

      {flashMessage ? (
        <section
          data-testid="quote-workflow-flash"
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "18px",
            padding: "16px 18px",
            border: flashTone === "success" ? "1px solid #bbf7d0" : "1px solid #cbd5e1",
            background: flashTone === "success" ? "#ecfdf5" : "#f8fafc",
            color: flashTone === "success" ? "#166534" : "#334155",
            display: "grid",
            gap: "4px",
          }}
        >
          <strong style={{ fontSize: "14px" }}>{flashTitle}</strong>
          <span style={{ fontWeight: 600 }}>{flashMessage}</span>
        </section>
      ) : null}

      <section
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "22px",
          border: "1px solid #e8edf3",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          {filteredQuoteRecords.length ? (
            filteredQuoteRecords.map(({ quote, summary }) => {
              const isExpanded = Boolean(expandedQuotes[quote.order_number]);
              const isHighlighted = highlightedQuote === quote.order_number;
              const readinessTone = summary.readiness.ready ? "success" : "warning";
              const collapsedFields = getCollapsedSummaryFields(quote, summary);

              return (
                <article
                  key={quote.order_number}
                  ref={(node) => {
                    if (node) {
                      cardRefs.current[quote.order_number] = node;
                    } else {
                      delete cardRefs.current[quote.order_number];
                    }
                  }}
                  style={{
                    border: `1px solid ${
                      isHighlighted ? "#22c55e" : isExpanded ? "#cbd5e1" : "#e2e8f0"
                    }`,
                    borderRadius: "18px",
                    padding: "16px 18px",
                    display: "grid",
                    gap: "14px",
                    background: isHighlighted ? "#f0fdf4" : isExpanded ? "#fcfdff" : "#ffffff",
                    boxShadow: isHighlighted
                      ? "0 0 0 3px rgba(34, 197, 94, 0.14), 0 14px 32px rgba(34, 197, 94, 0.12)"
                      : isExpanded
                      ? "0 8px 24px rgba(15, 23, 42, 0.06)"
                      : "none",
                    transition: "background 220ms ease, border-color 220ms ease, box-shadow 220ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "12px",
                      alignItems: "stretch",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleQuote(quote.order_number)}
                      aria-expanded={isExpanded}
                      aria-controls={`quote-details-${quote.order_number}`}
                      style={{
                        border: `1px solid ${isExpanded ? "#cbd5e1" : "#d6dbe4"}`,
                        background: isExpanded ? "#f8fafc" : "#ffffff",
                        color: "#0f172a",
                        borderRadius: "14px",
                        padding: "14px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "grid",
                        gap: "12px",
                        textAlign: "left",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin: 0,
                              color: "#64748b",
                              fontSize: "11px",
                              fontWeight: 800,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Request Summary
                          </p>
                          <p style={{ margin: "6px 0 0", color: "#0f172a", fontSize: "16px", fontWeight: 800 }}>
                            {quote.order_number}
                          </p>
                          {isHighlighted ? (
                            <p style={{ margin: "8px 0 0", color: "#166534", fontSize: "13px", fontWeight: 800 }}>
                              Newly created request now in workflow
                            </p>
                          ) : null}
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            color: "#334155",
                            flexShrink: 0,
                          }}
                        >
                          {isHighlighted ? (
                            <StatusPill tone="success">Just created</StatusPill>
                          ) : null}
                          <span>{isExpanded ? "Hide details" : "Show details"}</span>
                          <ExpandIcon open={isExpanded} />
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                          gap: "14px",
                        }}
                      >
                        {collapsedFields.map((field) => (
                          <Field key={field.label} label={field.label} value={field.value} tone={field.tone} />
                        ))}
                      </div>
                    </button>

                    <div style={{ display: "grid", gap: "10px", alignItems: "stretch" }}>
                      {summary.readiness.ready ? (
                        <button
                          type="button"
                          data-testid="quote-list-release-to-production"
                          onClick={() => handleReleaseToProduction(quote, summary)}
                          style={{
                            color: "#ffffff",
                            fontWeight: 800,
                            padding: "0 14px",
                            borderRadius: "12px",
                            border: "1px solid #166534",
                            background: "#166534",
                            cursor: "pointer",
                            minHeight: "56px",
                          }}
                        >
                          Release to Production
                        </button>
                      ) : null}
                      <Link
                        to={`/admin/quotes/${quote.order_number}`}
                        style={{
                          color: "#0f172a",
                          textDecoration: "none",
                          fontWeight: 700,
                          padding: "0 14px",
                          borderRadius: "12px",
                          border: "1px solid #d6dbe4",
                          background: "#ffffff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: "56px",
                        }}
                      >
                        Open Request
                      </Link>
                      {canViewArchivedQuotes ? (
                        <button
                          type="button"
                          onClick={() => handleArchiveQuote(quote)}
                          style={{
                            border: "1px solid #d6dbe4",
                            background: "#f8fafc",
                            color: "#0f172a",
                            borderRadius: "12px",
                            padding: "0 14px",
                            fontWeight: 700,
                            cursor: "pointer",
                            minHeight: "56px",
                          }}
                        >
                          Archive Request
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div
                    id={`quote-details-${quote.order_number}`}
                    style={{
                      display: "grid",
                      gridTemplateRows: isExpanded ? "1fr" : "0fr",
                      transition: "grid-template-rows 220ms ease, opacity 180ms ease",
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          borderTop: "1px solid #e2e8f0",
                          paddingTop: "14px",
                          display: "grid",
                          gap: "14px",
                          pointerEvents: isExpanded ? "auto" : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                color: "#64748b",
                                fontSize: "11px",
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Expanded Preview
                            </p>
                            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: "13px" }}>
                              Preview garments, placements, artwork, readiness, and pricing before opening the full workspace.
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <StatusPill tone={summary.approvalStatus === "Approved" ? "success" : "warning"}>
                              {summary.approvalStatus}
                            </StatusPill>
                            <StatusPill tone={summary.depositStatus === "Deposit received" ? "success" : "warning"}>
                              {summary.depositStatus}
                            </StatusPill>
                            <StatusPill tone={readinessTone}>
                              {buildReadinessSummary(summary.readiness)}
                            </StatusPill>
                          </div>
                        </div>

                        <section
                          style={{
                            borderRadius: "16px",
                            border: `1px solid ${summary.readiness.ready ? "#bbf7d0" : "#fed7aa"}`,
                            background: summary.readiness.ready ? "#ecfdf5" : "#fff7ed",
                            padding: "14px 16px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              alignItems: "center",
                              flexWrap: "wrap",
                              marginBottom: "10px",
                            }}
                          >
                            <div>
                              <p
                                style={{
                                  margin: 0,
                                  color: summary.readiness.ready ? "#166534" : "#9a3412",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                }}
                              >
                                Ready for Production
                              </p>
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  color: summary.readiness.ready ? "#166534" : "#7c2d12",
                                  fontWeight: 700,
                                }}
                              >
                                {summary.readiness.ready
                                  ? "This request has everything needed to move into production."
                                  : "This request still needs the items below before it can move into production."}
                              </p>
                            </div>
                            <StatusPill tone={readinessTone}>
                              {buildReadinessSummary(summary.readiness)}
                            </StatusPill>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {summary.readiness.checks.map((check) => (
                              <div
                                key={check.label}
                                style={{
                                  borderRadius: "12px",
                                  padding: "12px",
                                  border: `1px solid ${check.passed ? "#bbf7d0" : "#fed7aa"}`,
                                  background: check.passed ? "#f0fdf4" : "#fffaf0",
                                }}
                              >
                                <p
                                  style={{
                                    margin: 0,
                                    color: check.passed ? "#166534" : "#9a3412",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {check.label}
                                </p>
                                <strong
                                  style={{
                                    display: "block",
                                    marginTop: "6px",
                                    color: check.passed ? "#166534" : "#7c2d12",
                                  }}
                                >
                                  {check.detail}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </section>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "12px",
                          }}
                        >
                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                            <Field label="Garment" value={formatValue(quote.garment, "Custom garment")} />
                            <div style={{ marginTop: "12px" }}>
                              <Field label="Decoration" value={summary.decorationSummary} />
                            </div>
                            <div style={{ marginTop: "12px" }}>
                              <Field label="Quantity" value={formatValue(quote.qty, "0")} />
                            </div>
                          </div>

                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                            <Field label="Placements" value={summary.placementSummary} />
                            <div style={{ marginTop: "12px" }}>
                              <Field label="Artwork" value={formatList(summary.artworkNames)} />
                            </div>
                          </div>

                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                            {isStaffWorkspace ? (
                              <>
                                <Field label="Readiness" value={buildReadinessSummary(summary.readiness)} />
                                <div style={{ marginTop: "12px" }}>
                                  <Field label="Approval" value={summary.approvalStatus} />
                                </div>
                                <div style={{ marginTop: "12px" }}>
                                  <Field label="Deposit Status" value={summary.depositStatus} />
                                </div>
                              </>
                            ) : (
                              <>
                                <Field label="Pricing" value={`Deposit ${money(summary.depositTarget)} • Balance ${money(summary.balance)}`} />
                                <div style={{ marginTop: "12px" }}>
                                  <Field label="Invoice State" value={formatValue(summary.financials.invoice_status, "Draft")} />
                                </div>
                                <div style={{ marginTop: "12px" }}>
                                  <Field label="Collection Step" value={formatValue(summary.financials.payment_collection_state, "Awaiting Payment")} />
                                </div>
                              </>
                            )}
                          </div>

                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                            <Field
                              label="Production Info"
                              value={
                                canAdvanceQuoteStatus(quote.quote_status)
                                  ? `Next: ${getNextQuoteStatus(quote.quote_status)}`
                                  : "Next: Release to Production"
                              }
                            />
                            <div style={{ marginTop: "12px" }}>
                              <Field label="Source" value={formatValue(quote.source)} />
                            </div>
                          </div>
                        </div>

                        {canViewArchivedQuotes ? (
                          <section
                            style={{
                              border: "1px solid #d6dbe4",
                              borderRadius: "16px",
                              background: "#f8fafc",
                              padding: "14px 16px",
                              display: "grid",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <p
                                  style={{
                                    margin: 0,
                                    color: "#64748b",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Lifecycle Management
                                </p>
                                <p style={{ margin: "4px 0 0", color: "#334155", fontWeight: 700 }}>
                                  Archive Request
                                </p>
                              </div>
                              <StatusPill tone="warning">Admin / Owner</StatusPill>
                            </div>

                            <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                              Remove this request from active review once it should no longer appear in the queue, while keeping the full record recoverable in Archived Requests.
                            </p>

                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => handleArchiveQuote(quote)}
                                style={{
                                  border: "1px solid #d6dbe4",
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  borderRadius: "12px",
                                  padding: "11px 14px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Archive Request
                              </button>
                              <Link
                                to="/admin/quotes/archived"
                                style={{
                                  border: "1px solid #d6dbe4",
                                  background: "#ffffff",
                                  color: "#334155",
                                  borderRadius: "12px",
                                  padding: "11px 14px",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                View Archived Requests
                              </Link>
                            </div>
                          </section>
                        ) : null}

                        {quote.notes ? (
                          <div
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: "14px",
                              padding: "14px",
                              background: "#ffffff",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                color: "#64748b",
                                fontSize: "11px",
                                fontWeight: 800,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                              }}
                            >
                              Notes
                            </p>
                            <p style={{ margin: "8px 0 0", color: "#0f172a", lineHeight: 1.6 }}>{quote.notes}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: "18px",
                padding: "28px",
                color: "#64748b",
              }}
            >
              {hasActiveFilters
                ? buildQuoteEmptyState(activeQueueFilter)
                : "No active requests yet. New order requests will appear here for review."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
