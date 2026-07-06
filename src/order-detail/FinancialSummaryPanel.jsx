import { useState } from "react";
import { validatePaymentAmount } from "../lib/financialValidation";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { PAYMENT_METHOD_OPTIONS } from "../orders/orderFinancials";
import {
  buildDepositRequestContent,
  buildDepositRequestMailto,
} from "../orders/depositRequests";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { normalizeOperationalStatus } from "../orders/orderWorkflow";
import {
  getPaymentEventsByOrder,
  getPaymentRequestsByOrder,
  getPaymentsByOrder,
  usePaymentsSnapshot,
} from "../lib/paymentsStore";
import { listPaymentReconciliationReviews } from "../lib/paymentReconciliationStore";
import {
  buildPaymentReconciliationInsights,
  getInsightTone,
  getPaymentConfidenceLabel,
} from "../services/paymentReconciliation";
import { buildDepositWorkflowLabel } from "../orders/depositWorkflowDisplay";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getPickupStatusStyle(status) {
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
    };
  }

  if (status === "Picked Up") return badgeStyle("#dcfce7", "#166534");
  if (status === "Ready for Pickup") return badgeStyle("#dbeafe", "#1d4ed8");
  return badgeStyle("#e2e8f0", "#334155");
}

const rowLabelStyle = {
  color: "#57534e",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const rowValueStyle = {
  color: "#171717",
  fontSize: "18px",
  fontWeight: 800,
};

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "11px 12px",
  boxSizing: "border-box",
  width: "100%",
  background: "#ffffff",
};

function confidencePalette(tone) {
  const palettes = {
    danger: { border: "#fecaca", background: "#fef2f2", color: "#991b1b" },
    warning: { border: "#fed7aa", background: "#fff7ed", color: "#9a3412" },
    success: { border: "#bbf7d0", background: "#ecfdf5", color: "#166534" },
  };
  return palettes[tone] || { border: "#e2e8f0", background: "#f8fafc", color: "#334155" };
}

export default function FinancialSummaryPanel({
  order,
  onRecordPayment,
  onMarkPickedUp,
  onSendDepositRequest,
}) {
  const operationalStatus = normalizeOperationalStatus(order.status);
  const canceled = operationalStatus === "Canceled";
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [depositRequestOpen, setDepositRequestOpen] = useState(false);
  const [depositRequestStatus, setDepositRequestStatus] = useState("");
  const [amount, setAmount] = useState(order.balance_due > 0 ? String(order.balance_due) : "");
  const [method, setMethod] = useState(PAYMENT_METHOD_OPTIONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  usePaymentsSnapshot();
  const depositRequest = buildDepositRequestContent(order);
  const paymentValidation = validatePaymentAmount({
    amount,
    remainingBalance: order.balance_due,
  });
  const paymentError = error || (!paymentValidation.valid ? paymentValidation.message : "");
  const canSendDepositRequest =
    !canceled && (Number(order.deposit_amount || 0) > 0 || Number(order.balance_due || 0) > 0);
  const paymentRequests = getPaymentRequestsByOrder(order.order_number);
  const orderPayments = getPaymentsByOrder(order.order_number);
  const paymentEvents = getPaymentEventsByOrder(order.order_number);
  const reconciliationReviews = listPaymentReconciliationReviews();
  const reconciliationRecords = paymentRequests.map((paymentRequest) => {
    const insights = buildPaymentReconciliationInsights({
      paymentRequest,
      payments: orderPayments,
      paymentEvents,
      reviews: reconciliationReviews,
    });
    return {
      paymentRequest,
      insights,
      confidence: getPaymentConfidenceLabel(insights, paymentRequest),
    };
  });
  const priorityRecord =
    reconciliationRecords.find((record) => record.insights.some((insight) => insight.severity === "high" && !insight.reviewed)) ||
    reconciliationRecords.find((record) => record.confidence === "Awaiting Webhook Confirmation") ||
    reconciliationRecords.find((record) => record.confidence === "Payment Verified") ||
    null;
  const priorityInsight = priorityRecord?.insights.find((insight) => !insight.reviewed) || priorityRecord?.insights[0] || null;
  const priorityPalette = confidencePalette(getInsightTone(priorityInsight || {}));

  const canMarkPickedUp =
    !canceled &&
    order.pickup_status !== "Picked Up" &&
    ["Ready For Pickup", "Completed"].includes(operationalStatus);

  function resetPaymentForm(nextAmount = "") {
    setAmount(nextAmount);
    setMethod(PAYMENT_METHOD_OPTIONS[0]);
    setNote("");
    setError("");
  }

  function handleTogglePaymentForm() {
    const nextOpenState = !paymentFormOpen;
    setPaymentFormOpen(nextOpenState);

    if (nextOpenState) {
      resetPaymentForm(order.balance_due > 0 ? String(order.balance_due) : "");
    } else {
      resetPaymentForm("");
    }
  }

  function handleToggleDepositRequest() {
    setDepositRequestOpen((current) => !current);
    setDepositRequestStatus("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!paymentValidation.valid) {
      setError(paymentValidation.message || "Enter a valid payment amount.");
      alert(
        paymentValidation.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : paymentValidation.message || "Enter a valid payment amount."
      );
      return;
    }

    try {
      onRecordPayment({
        amount: Number(amount),
        method,
        note,
      });
    } catch (submissionError) {
      const message =
        submissionError?.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : submissionError?.message || "Enter a valid payment amount.";
      setError(message);
      alert(message);
      return;
    }

    setPaymentFormOpen(false);
    resetPaymentForm("");
  }

  async function handleCopyDepositRequest() {
    try {
      const result = await onSendDepositRequest?.({
        channel: "clipboard",
        subject: depositRequest.subject,
        body: depositRequest.body,
      });
      const messageWithCheckout = buildDepositRequestContent(order, {
        checkoutUrl: result?.checkoutUrl,
      });

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(messageWithCheckout.fullMessage);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setDepositRequestStatus("Deposit request copied to clipboard.");
    } catch (error) {
      setDepositRequestStatus(
        error instanceof Error
          ? error.message
          : "Clipboard unavailable. Use the email draft action instead."
      );
    }
  }

  async function handleOpenEmailDraft() {
    try {
      const result = await onSendDepositRequest?.({
        channel: "mailto",
        subject: depositRequest.subject,
        body: depositRequest.body,
      });

      if (typeof window !== "undefined") {
        window.location.href = buildDepositRequestMailto(order, {
          checkoutUrl: result?.checkoutUrl,
        });
      }
      setDepositRequestStatus("Email draft opened with the deposit request.");
    } catch (error) {
      setDepositRequestStatus(
        error instanceof Error
          ? error.message
          : "Unable to create the Square deposit checkout link."
      );
    }
  }

  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Payment Summary</h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            Operational payment tracking for this order.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleTogglePaymentForm}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
            }}
          >
            Record Payment
          </button>

          <button
            type="button"
            disabled={!canSendDepositRequest}
            onClick={handleToggleDepositRequest}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: canSendDepositRequest ? "pointer" : "not-allowed",
              opacity: canSendDepositRequest ? 1 : 0.6,
            }}
          >
            Send Deposit Request
          </button>

          <button
            type="button"
            disabled={!canMarkPickedUp}
            onClick={onMarkPickedUp}
            style={{
              background: canMarkPickedUp ? "#171717" : "#cbd5e1",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: canMarkPickedUp ? "pointer" : "not-allowed",
            }}
          >
            Mark Picked Up
          </button>
        </div>
      </div>

      {canceled ? (
        <div
          style={{
            marginBottom: "18px",
            borderRadius: "16px",
            padding: "14px 16px",
            border: "1px solid #fecaca",
            background: "#fff5f5",
            color: "#7f1d1d",
            fontWeight: 700,
            lineHeight: 1.6,
          }}
        >
          This order is canceled. Payment history is preserved for review, but deposit requests and pickup actions are disabled.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "14px 16px",
            background: "#f8fafc",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <span style={rowLabelStyle}>Invoice Status</span>
              <PaymentStatusBadge status={order.invoice_status} />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <span style={rowLabelStyle}>Payment Status</span>
              <PaymentStatusBadge status={order.canonical_payment_state || order.payment_status} />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <span style={rowLabelStyle}>Workflow State</span>
              <span style={{ color: "#334155", fontWeight: 700 }}>
                {order.canonical_workflow_state || order.payment_collection_state}
              </span>
            </div>
          </div>

          <div>
            <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>
              {order.deposit_credited_message}
            </p>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {order.balance_summary}
            </p>
          </div>
        </div>

        {priorityRecord ? (
          <div
            style={{
              gridColumn: "1 / -1",
              border: `1px solid ${priorityPalette.border}`,
              borderRadius: "16px",
              padding: "14px 16px",
              background: priorityPalette.background,
            }}
          >
            <span style={rowLabelStyle}>Payment Confidence</span>
            <p style={{ margin: "6px 0 4px", color: priorityPalette.color, fontWeight: 900 }}>
              {priorityRecord.confidence}
            </p>
            <p style={{ margin: 0, color: "#475569" }}>
              {priorityInsight?.detail || "Square payment activity is linked to this order."}
            </p>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Subtotal</span>
          <span style={rowValueStyle}>{money(order.subtotal)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Tax</span>
          <span style={rowValueStyle}>{money(order.tax_amount)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Total</span>
          <span style={rowValueStyle}>{money(order.total_amount)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Deposit</span>
          <span style={rowValueStyle}>{buildDepositWorkflowLabel(order)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Deposit Applied</span>
          <span style={rowValueStyle}>{money(order.deposit_applied)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Paid To Date</span>
          <span style={rowValueStyle}>{money(order.total_paid)}</span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Remaining Balance</span>
          <span style={{ ...rowValueStyle, color: order.balance_due > 0 ? "#991b1b" : "#166534" }}>
            {money(order.balance_due)}
          </span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={rowLabelStyle}>Amount Due Now</span>
          <span style={{ ...rowValueStyle, color: order.amount_due_now > 0 ? "#9a3412" : "#166534" }}>
            {money(order.amount_due_now)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: paymentFormOpen ? "18px" : "0",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <span style={rowLabelStyle}>Pickup Status</span>
          <span style={getPickupStatusStyle(order.pickup_status)}>{order.pickup_status}</span>
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <span style={rowLabelStyle}>Due Date</span>
          <span style={{ color: order.is_payment_overdue ? "#b91c1c" : "#334155", fontWeight: 700 }}>
            {order.invoice_due_date ? formatShortDate(order.invoice_due_date) : "—"}
          </span>
        </div>
      </div>

      {paymentFormOpen ? (
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: "1px solid #e2e8f0",
            marginTop: "18px",
            paddingTop: "18px",
            display: "grid",
            gap: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#292524" }}>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError("");
                }}
                style={{
                  ...fieldStyle,
                  border: paymentError ? "1px solid #dc2626" : fieldStyle.border,
                  background: paymentError ? "#fef2f2" : fieldStyle.background,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#292524" }}>
              Payment Method
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                style={fieldStyle}
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700, color: "#292524" }}>
            Note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Optional note for the payment record"
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>

          {paymentError ? (
            <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{paymentError}</p>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!paymentValidation.valid}
              style={{
                background: paymentValidation.valid ? "#171717" : "#a8a29e",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
                cursor: paymentValidation.valid ? "pointer" : "not-allowed",
              }}
            >
              Save Payment
            </button>

            <button
              type="button"
              onClick={handleTogglePaymentForm}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {depositRequestOpen ? (
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            marginTop: paymentFormOpen ? "0" : "18px",
            paddingTop: "18px",
            display: "grid",
            gap: "14px",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Deposit Request</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Generate a customer-facing deposit request with a Square checkout link.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "14px",
              background: "#f8fafc",
              display: "grid",
              gap: "10px",
            }}
          >
            <div>
              <span style={rowLabelStyle}>Subject</span>
              <p style={{ margin: "4px 0 0", color: "#171717", fontWeight: 700 }}>
                {depositRequest.subject}
              </p>
            </div>

            <div>
              <span style={rowLabelStyle}>Message</span>
              <pre
                style={{
                  margin: "6px 0 0",
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  color: "#334155",
                  lineHeight: 1.5,
                }}
              >
                {depositRequest.body}
              </pre>
            </div>
          </div>

          {depositRequestStatus ? (
            <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>{depositRequestStatus}</p>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleCopyDepositRequest}
              style={{
                background: "#171717",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Copy Message
            </button>

            <button
              type="button"
              onClick={handleOpenEmailDraft}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Open Email Draft
            </button>

            <button
              type="button"
              onClick={handleToggleDepositRequest}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          borderTop: "1px solid #e2e8f0",
          marginTop: "18px",
          paddingTop: "18px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Payment History</h3>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Deposit receipts and payments already credited against this invoice.
          </p>
        </div>

        {!order.payment_history?.length ? (
          <p style={{ margin: 0, color: "#94a3b8" }}>No payments recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {order.payment_history.map((payment) => (
              <article
                key={payment.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: "15px" }}>{money(payment.amount)}</strong>
                  <span style={{ color: "#475569", fontSize: "13px", fontWeight: 700 }}>
                    {payment.method}
                  </span>
                </div>

                <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                  {payment.staff_member} • {formatDateTime(payment.timestamp)}
                </div>

                {payment.note ? (
                  <p style={{ margin: "6px 0 0", color: "#334155", fontSize: "14px" }}>
                    {payment.note}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
