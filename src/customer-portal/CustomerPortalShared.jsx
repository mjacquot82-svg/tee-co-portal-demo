import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatShortDate } from "../lib/dateFormatting";
import { formatCurrency } from "./useCustomerPortalData";
import WorkflowBadge from "../components/WorkflowBadge";
import {
  buildCustomerWorkflowMessage,
  buildWorkflowStatusBadges,
} from "../orders/workflowPresentation";
import {
  buildDepositContactHref,
  buildDepositPaymentRoute,
  getDepositPaymentProviderConfig,
  isDepositActionRequired,
} from "../lib/depositPaymentProviders";
import {
  buildArtworkActionRoute,
  getCustomerArtworkActionState,
  isCustomerArtworkActionRequired,
} from "../lib/customerArtworkActions";
import { getPaymentRequestsByOrder, getPaymentsByOrder, usePaymentsSnapshot } from "../lib/paymentsStore";
import {
  formatPaymentRequestType,
  getCustomerPaymentStatusLabel,
  getCustomerPaymentStatusTone,
} from "./customerPortalPayments";

const EMPTY_RECORDS = Object.freeze([]);
const STATUS_FALLBACK_CACHE = new Map();

function getStableStatusBadge(label, tone = "neutral") {
  const cacheKey = `${tone}:${label}`;
  const cachedBadge = STATUS_FALLBACK_CACHE.get(cacheKey);
  if (cachedBadge) {
    return cachedBadge;
  }

  const nextBadge = Object.freeze({ label, tone });
  STATUS_FALLBACK_CACHE.set(cacheKey, nextBadge);
  return nextBadge;
}

export function PortalPage({ eyebrow, title, description, children }) {
  return (
    <section style={{ display: "grid", gap: "24px" }}>
      <div style={{ display: "grid", gap: "8px" }}>
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
          {eyebrow}
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: "34px",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#0f172a",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, maxWidth: "720px", color: "#475569", lineHeight: 1.7 }}>
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

export function MetricCard({ label, value, helper }) {
  return (
    <div
      style={{
        padding: "18px 18px 16px",
        borderRadius: "20px",
        border: "1px solid #dbe4ee",
        background: "#ffffff",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          color: "#64748b",
          fontSize: "12px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p style={{ margin: "0 0 4px", color: "#0f172a", fontSize: "28px", fontWeight: 800 }}>
        {value}
      </p>
      <p style={{ margin: 0, color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>{helper}</p>
    </div>
  );
}

export function SectionCard({ title, subtitle, children }) {
  return (
    <section
      style={{
        borderRadius: "24px",
        border: "1px solid #dbe4ee",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
        boxShadow: "0 18px 42px rgba(15, 23, 42, 0.06)",
        padding: "22px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: "22px", lineHeight: 1.1 }}>
          {title}
        </h2>
        {subtitle ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px", lineHeight: 1.6 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, description, actionLabel, actionTo = "/" }) {
  return (
    <div
      style={{
        borderRadius: "20px",
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        padding: "24px",
        display: "grid",
        gap: "8px",
      }}
    >
      <strong style={{ color: "#0f172a", fontSize: "18px" }}>{title}</strong>
      <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>{description}</p>
      {actionLabel ? (
        <div>
          <Link
            to={actionTo}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: "999px",
              background: "#0f172a",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function DetailPair({ label, value }) {
  return (
    <div
      style={{
        padding: "14px 15px",
        borderRadius: "16px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          color: "#64748b",
          fontSize: "11px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, color: "#0f172a", fontWeight: 700, lineHeight: 1.5 }}>{value}</p>
    </div>
  );
}

function badgeStyle(background, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "6px 10px",
    background,
    color,
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
}

function PortalStatusBadge({ label, tone = "neutral" }) {
  const tones = {
    neutral: badgeStyle("#e2e8f0", "#334155"),
    info: badgeStyle("#dbeafe", "#1d4ed8"),
    warning: badgeStyle("#fef3c7", "#92400e"),
    success: badgeStyle("#dcfce7", "#166534"),
    danger: badgeStyle("#fee2e2", "#b91c1c"),
  };

  return <span style={tones[tone] || tones.neutral}>{label}</span>;
}

const STATUS_BADGES = Object.freeze({
  orderCanceled: Object.freeze({ label: "Canceled", tone: "danger" }),
  orderCompleted: Object.freeze({ label: "Completed", tone: "success" }),
  orderReady: Object.freeze({ label: "Ready for Pickup", tone: "info" }),
  orderAwaitingApproval: Object.freeze({ label: "Awaiting Approval", tone: "warning" }),
  orderPaymentDue: Object.freeze({ label: "Payment Due", tone: "warning" }),
  orderProduction: Object.freeze({ label: "In Production", tone: "info" }),
  orderInProgress: Object.freeze({ label: "In Progress", tone: "neutral" }),
  quoteApproved: Object.freeze({ label: "Approved", tone: "success" }),
  quoteInReview: Object.freeze({ label: "In Review", tone: "neutral" }),
  paymentPaid: Object.freeze({ label: "Paid", tone: "success" }),
  paymentDueInfo: Object.freeze({ label: "Payment Due", tone: "info" }),
  paymentDueWarning: Object.freeze({ label: "Payment Due", tone: "warning" }),
  paymentDueDanger: Object.freeze({ label: "Payment Due", tone: "danger" }),
  paymentDepositReceived: Object.freeze({ label: "Deposit Received", tone: "success" }),
  paymentPartiallyPaid: Object.freeze({ label: "Partially Paid", tone: "success" }),
  paymentBillingPending: Object.freeze({ label: "Billing Pending", tone: "neutral" }),
});

function normalizeOperationalStatusValue(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ready for pickup") return "Ready For Pickup";
  if (normalized === "awaiting production") return "Ready For Production";
  if (normalized === "in production") return "Printing";
  return String(status || "").trim();
}

export function resolveCustomerOrderStatus(order = {}) {
  const operationalStatus = normalizeOperationalStatusValue(order.status);
  const quoteStatus = String(order.quote_status || "").trim();
  const pickupStatus = String(order.pickup_status || "").trim();
  const invoiceStatus = String(order.invoice_status || "").trim();

  if (operationalStatus === "Canceled" || quoteStatus === "Canceled") {
    return STATUS_BADGES.orderCanceled;
  }

  if (pickupStatus === "Picked Up" || operationalStatus === "Completed") {
    return STATUS_BADGES.orderCompleted;
  }

  if (pickupStatus === "Ready for Pickup" || operationalStatus === "Ready For Pickup") {
    return STATUS_BADGES.orderReady;
  }

  if (quoteStatus === "Awaiting Approval" || quoteStatus === "Awaiting Artwork Approval") {
    return STATUS_BADGES.orderAwaitingApproval;
  }

  if (quoteStatus === "Awaiting Deposit") {
    return STATUS_BADGES.orderPaymentDue;
  }

  if (
    invoiceStatus === "Awaiting Deposit" ||
    invoiceStatus === "Awaiting Payment" ||
    invoiceStatus === "Awaiting Final Payment" ||
    invoiceStatus === "Sent" ||
    invoiceStatus === "Overdue"
  ) {
    return STATUS_BADGES.orderPaymentDue;
  }

  if (
    ["Ready For Production", "Printing", "Embroidery", "QC / Finishing"].includes(
      operationalStatus
    )
  ) {
    return STATUS_BADGES.orderProduction;
  }

  if (quoteStatus === "Approved" || quoteStatus === "Ready For Production") {
    return STATUS_BADGES.orderProduction;
  }

  if (operationalStatus === "New" || quoteStatus === "Sent" || quoteStatus === "Draft") {
    return STATUS_BADGES.orderAwaitingApproval;
  }

  return STATUS_BADGES.orderInProgress;
}

function resolveCustomerQuoteStatus(record = {}) {
  const quoteStatus = String(record.quote_status || "").trim();

  if (quoteStatus === "Awaiting Approval" || quoteStatus === "Awaiting Artwork Approval") {
    return STATUS_BADGES.orderAwaitingApproval;
  }

  if (quoteStatus === "Awaiting Deposit") {
    return STATUS_BADGES.orderPaymentDue;
  }

  if (quoteStatus === "Approved" || quoteStatus === "Ready For Production") {
    return STATUS_BADGES.quoteApproved;
  }

  if (quoteStatus === "Sent" || quoteStatus === "Draft") {
    return STATUS_BADGES.quoteInReview;
  }

  if (quoteStatus === "Canceled") {
    return STATUS_BADGES.orderCanceled;
  }

  return getStableStatusBadge(quoteStatus || "In Review");
}

export function resolveCustomerPaymentStatus(record = {}, options = {}) {
  const invoiceStatus = String(record.invoice_status || "").trim();
  const balanceDue = Number(record.balance_due || 0);
  const totalPaid = Number(record.total_paid || 0);
  const depositAmount = Number(record.deposit_amount || 0);
  const { includeDraft = true } = options;

  if (!invoiceStatus && balanceDue <= 0 && totalPaid <= 0) {
    return null;
  }

  if (invoiceStatus === "Paid" || balanceDue <= 0) {
    return STATUS_BADGES.paymentPaid;
  }

  if (invoiceStatus === "Awaiting Deposit") {
    return STATUS_BADGES.paymentDueWarning;
  }

  if (invoiceStatus === "Overdue") {
    return STATUS_BADGES.paymentDueDanger;
  }

  if (
    invoiceStatus === "Partial Payment" ||
    invoiceStatus === "Deposit Applied" ||
    invoiceStatus === "Deposit Paid"
  ) {
    return depositAmount > 0 && totalPaid >= depositAmount
      ? STATUS_BADGES.paymentDepositReceived
      : STATUS_BADGES.paymentPartiallyPaid;
  }

  if (invoiceStatus === "Sent" || invoiceStatus === "Awaiting Payment" || invoiceStatus === "Awaiting Final Payment") {
    return STATUS_BADGES.paymentDueInfo;
  }

  if (invoiceStatus === "Refunded" || invoiceStatus === "Void") {
    return getStableStatusBadge(invoiceStatus);
  }

  if (invoiceStatus === "Draft") {
    if (!includeDraft) {
      return null;
    }

    return STATUS_BADGES.paymentBillingPending;
  }

  return getStableStatusBadge(invoiceStatus || "Billing Pending");
}

function resolveTimelineNote(order) {
  if (order.pickup_status === "Ready for Pickup") {
    return Number(order.balance_due || 0) > 0
      ? `Ready for pickup after ${formatCurrency(order.balance_due)} is settled`
      : "Ready for pickup";
  }

  if (Number(order.balance_due || 0) > 0 && buildCustomerWorkflowMessage(order) === "Ready for production") {
    return `${formatCurrency(order.balance_due)} still open`;
  }

  return buildCustomerWorkflowMessage(order);
}

function resolveArtworkApprovalLabel(record = {}) {
  const required =
    typeof record.artwork_approval_required === "boolean"
      ? record.artwork_approval_required
      : Boolean(record.customer_artwork_id) ||
        (Array.isArray(record.artwork_files) && record.artwork_files.length > 0);

  return required ? record.artwork_approval_status || "Pending Review" : "Not Required";
}

export function resolveDepositWorkflowLabel(record = {}) {
  if (isDepositActionRequired(record)) {
    return "Action Needed: Deposit Required";
  }

  return record.deposit_workflow_status || (record.deposit_required ? "Awaiting Deposit" : "Deposit Not Required");
}

function PortalRecordActionNeeded({ record }) {
  const providerConfig = getDepositPaymentProviderConfig(record);
  const orderNumber = record.order_number || record.id || "";
  const contactHref = buildDepositContactHref(record, providerConfig);

  return (
    <div
      data-testid="portal-action-needed"
      style={{
        borderRadius: "18px",
        border: "1px solid #fde68a",
        background: "#fffbeb",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <strong style={{ color: "#78350f", fontSize: "16px" }}>
          Action Needed: Deposit Required
        </strong>
        <p style={{ margin: 0, color: "#92400e", lineHeight: 1.6 }}>
          Tee & Co needs a deposit before this order can continue.
        </p>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link
          to={buildDepositPaymentRoute(orderNumber)}
          data-testid="portal-pay-deposit-link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            borderRadius: "999px",
            background: "#0f766e",
            color: "#ffffff",
            padding: "10px 16px",
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 12px 24px rgba(15, 118, 110, 0.18)",
          }}
        >
          Pay Deposit
        </Link>
        <a
          href={contactHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            borderRadius: "999px",
            border: "1px solid #f59e0b",
            background: "#ffffff",
            color: "#78350f",
            padding: "9px 15px",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Contact Tee & Co
        </a>
      </div>
    </div>
  );
}

function PortalArtworkActionNeeded({ record }) {
  const orderNumber = record.order_number || record.id || "";
  const artworkAction = getCustomerArtworkActionState(record);

  return (
    <div
      data-testid="portal-artwork-action-needed"
      style={{
        borderRadius: "18px",
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <strong style={{ color: "#1e3a8a", fontSize: "16px" }}>
          {artworkAction.label || "Action Needed: Artwork Required"}
        </strong>
        <p style={{ margin: 0, color: "#1d4ed8", lineHeight: 1.6 }}>
          Tee & Co needs artwork details before this order can continue.
        </p>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link
          to={buildArtworkActionRoute(orderNumber)}
          data-testid="portal-upload-artwork-link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            borderRadius: "999px",
            background: "#1d4ed8",
            color: "#ffffff",
            padding: "10px 16px",
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 12px 24px rgba(29, 78, 216, 0.18)",
          }}
        >
          {artworkAction.primaryLabel || "Upload Artwork"}
        </Link>
        <Link
          to={`${buildArtworkActionRoute(orderNumber)}?mode=help`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            borderRadius: "999px",
            border: "1px solid #93c5fd",
            background: "#ffffff",
            color: "#1e3a8a",
            padding: "9px 15px",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Need Artwork Help
        </Link>
      </div>
    </div>
  );
}

function PortalOrderPayments({ paymentRequests, payments }) {
  if (!paymentRequests.length && !payments.length) {
    return null;
  }

  const latestPaymentRequest = paymentRequests[0] || null;
  const latestPayment = payments[0] || null;
  const latestStatus = latestPaymentRequest
    ? getCustomerPaymentStatusLabel(latestPaymentRequest)
    : latestPayment
    ? getCustomerPaymentStatusLabel(latestPayment)
    : null;

  return (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid #dbe4ee",
        background: "#f8fafc",
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <strong style={{ color: "#0f172a", fontSize: "16px" }}>Payments</strong>
          <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
            {paymentRequests.length} request{paymentRequests.length === 1 ? "" : "s"} · {payments.length} payment{payments.length === 1 ? "" : "s"} recorded
          </p>
        </div>
        {latestStatus ? <PortalStatusBadge label={latestStatus} tone={getCustomerPaymentStatusTone(latestStatus)} /> : null}
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {latestPaymentRequest ? (
          <Link
            to={`/portal/payments/${encodeURIComponent(latestPaymentRequest.id)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "42px",
              borderRadius: "999px",
              background: "#0f766e",
              color: "#ffffff",
              padding: "10px 16px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            View {formatPaymentRequestType(latestPaymentRequest.request_type)} Request
          </Link>
        ) : null}
        <Link
          to="/portal/payments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            borderRadius: "999px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            padding: "9px 15px",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          View Payment History
        </Link>
      </div>
    </div>
  );
}

export function RecordList({ records = [], type = "orders" }) {
  const safeRecords = Array.isArray(records) ? records : EMPTY_RECORDS;
  const paymentsSnapshot = usePaymentsSnapshot();
  const viewModels = useMemo(
    () => {
      const nextViewModels = safeRecords.map((record) => {
        const total = formatCurrency(record.total_amount || record.total || 0);
        const balance = formatCurrency(record.balance_due || 0);
        const dueDate = record.invoice_due_date || record.due_date || "";
        const relatedPaymentRequests =
          type === "orders" || type === "invoices"
            ? getPaymentRequestsByOrder(record.order_number)
            : [];
        const relatedPayments =
          type === "orders" || type === "invoices"
            ? getPaymentsByOrder(record.order_number)
            : [];
        const primaryStatus =
          type === "quotes"
            ? resolveCustomerQuoteStatus(record)
            : type === "orders"
            ? resolveCustomerOrderStatus(record)
            : null;
        const paymentStatus =
          type === "invoices"
            ? resolveCustomerPaymentStatus(record)
            : type === "orders"
            ? resolveCustomerPaymentStatus(record, { includeDraft: false })
            : null;

        return {
          record,
          total,
          balance,
          dueDate,
          relatedPaymentRequests,
          relatedPayments,
          primaryStatus,
          paymentStatus,
          timelineNote: resolveTimelineNote(record),
        };
      });

      console.debug("[portal] RecordList view models", {
        type,
        recordCount: safeRecords.length,
        statuses: nextViewModels.map(({ record, primaryStatus, paymentStatus }) => ({
          orderNumber: record.order_number || record.id || "unknown",
          operationalStatus: record.status || "",
          quoteStatus: record.quote_status || "",
          pickupStatus: record.pickup_status || "",
          invoiceStatus: record.invoice_status || "",
          primaryStatus: primaryStatus?.label || null,
          paymentStatus: paymentStatus?.label || null,
        })),
      });

      return nextViewModels;
    },
    [paymentsSnapshot, safeRecords, type]
  );

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {viewModels.map(({ record, total, balance, dueDate, relatedPaymentRequests, relatedPayments, primaryStatus, paymentStatus, timelineNote }) => {
        const workflowBadges =
          type === "orders" ? buildWorkflowStatusBadges(record, { surface: "customer" }) : [];
        const depositActionRequired = isDepositActionRequired(record);
        const artworkActionRequired = isCustomerArtworkActionRequired(record);
        return (
          <article
            key={`${type}-${record.order_number || record.id}`}
            id={type === "orders" ? `order-${record.order_number}` : undefined}
            style={{
              borderRadius: "20px",
              border: "1px solid #dbe4ee",
              background: "#ffffff",
              padding: "18px",
              display: "grid",
              gap: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "14px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ color: "#0f172a", fontSize: "18px" }}>
                  {record.order_number || "Portal record"}
                </strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {primaryStatus ? (
                    <PortalStatusBadge label={primaryStatus.label} tone={primaryStatus.tone} />
                  ) : null}
                  {paymentStatus ? (
                    <PortalStatusBadge label={paymentStatus.label} tone={paymentStatus.tone} />
                  ) : null}
                  {workflowBadges.map((badge) => (
                    <WorkflowBadge
                      key={`${record.order_number || record.id}-${badge.label}`}
                      label={badge.label}
                      tone={badge.tone}
                    />
                  ))}
                </div>
              </div>

              <div style={{ textAlign: "right", minWidth: "160px" }}>
                <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                  Total
                </p>
                <p style={{ margin: "4px 0 0", color: "#0f172a", fontWeight: 800, fontSize: "20px" }}>
                  {total}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "10px",
              }}
            >
              <DetailPair
                label="Item"
                value={record.garment || record.category || "Custom order"}
              />
              <DetailPair
                label="Updated"
                value={record.updated_at ? formatShortDate(record.updated_at) : "Recently"}
              />
              <DetailPair
                label="Due"
                value={dueDate ? formatShortDate(dueDate) : "Scheduling in progress"}
              />
              <DetailPair label="Artwork" value={resolveArtworkApprovalLabel(record)} />
              <DetailPair label="Deposit" value={resolveDepositWorkflowLabel(record)} />
              <DetailPair label="Balance" value={balance} />
            </div>

            {artworkActionRequired ? <PortalArtworkActionNeeded record={record} /> : null}
            {depositActionRequired ? <PortalRecordActionNeeded record={record} /> : null}
            {type === "orders" || type === "invoices" ? (
              <PortalOrderPayments
                paymentRequests={relatedPaymentRequests}
                payments={relatedPayments}
              />
            ) : null}

            {type === "orders" ? (
              <div>
                <Link
                  to={`/portal/orders/${encodeURIComponent(record.order_number || "")}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "40px",
                    borderRadius: "999px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    padding: "9px 14px",
                    textDecoration: "none",
                    fontWeight: 800,
                  }}
                >
                  View Order Detail
                </Link>
              </div>
            ) : null}

            <p
              style={{
                margin: 0,
                color: "#334155",
                lineHeight: 1.6,
                borderTop: "1px solid #e2e8f0",
                paddingTop: "12px",
              }}
            >
              {timelineNote}
            </p>
          </article>
        );
      })}
    </div>
  );
}
