import { Link } from "react-router-dom";
import { useState } from "react";
import { formatDateTime } from "../lib/dateFormatting";
import {
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  usePaymentsSnapshot,
} from "../lib/paymentsStore";
import {
  buildPaymentExceptionQueue,
  buildPaymentReconciliationInsights,
  getInsightTone,
  getPaymentConfidenceLabel,
  isActionableReconciliationInsight,
} from "../services/paymentReconciliation";
import {
  buildReconciliationReviewKey,
  listPaymentReconciliationReviews,
  upsertPaymentReconciliationReview,
} from "../lib/paymentReconciliationStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function tonePalette(tone) {
  const palettes = {
    danger: { border: "#fecaca", background: "#fef2f2", color: "#991b1b" },
    warning: { border: "#fed7aa", background: "#fff7ed", color: "#9a3412" },
    success: { border: "#bbf7d0", background: "#ecfdf5", color: "#166534" },
  };
  return palettes[tone] || { border: "#e2e8f0", background: "#f8fafc", color: "#334155" };
}

function SectionCard({ title, description, children }) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "22px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b" }}>{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div style={{ border: "1px dashed #cbd5e1", borderRadius: "16px", padding: "18px", color: "#64748b" }}>
      <strong style={{ color: "#0f172a" }}>{title}</strong>
      {detail ? <p style={{ margin: "6px 0 0" }}>{detail}</p> : null}
    </div>
  );
}

function getRelatedPayments(payments, request) {
  return payments.filter(
    (payment) =>
      payment.payment_request_id === request.id ||
      (request.order_number && payment.order_number === request.order_number)
  );
}

function getRelatedEvents(events, request, relatedPayments) {
  const paymentIds = new Set(relatedPayments.map((payment) => payment.id));
  return events.filter(
    (event) =>
      event.payment_request_id === request.id ||
      paymentIds.has(event.payment_id) ||
      (request.order_number && event.order_number === request.order_number)
  );
}

export default function PaymentReconciliation() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const paymentsSnapshot = usePaymentsSnapshot();
  void refreshKey;
  const paymentRequests = paymentsSnapshot.paymentRequests.length ? paymentsSnapshot.paymentRequests : listPaymentRequests();
  const payments = paymentsSnapshot.payments.length ? paymentsSnapshot.payments : listPayments();
  const paymentEvents = paymentsSnapshot.paymentEvents.length ? paymentsSnapshot.paymentEvents : listPaymentEvents();
  const reviews = listPaymentReconciliationReviews();
  const exceptionQueue = buildPaymentExceptionQueue({
    paymentRequests,
    payments,
    paymentEvents,
    reviews,
  });
  const selectedItem = exceptionQueue.find((item) => item.id === selectedId) || exceptionQueue[0] || null;
  const selectedRequest = selectedItem?.paymentRequest || null;
  const relatedPayments = selectedRequest ? getRelatedPayments(payments, selectedRequest) : [];
  const relatedEvents = selectedRequest ? getRelatedEvents(paymentEvents, selectedRequest, relatedPayments) : [];
  const selectedInsights = selectedRequest
    ? buildPaymentReconciliationInsights({
        paymentRequest: selectedRequest,
        payments,
        paymentEvents,
        reviews,
      })
    : [];
  const actionableInsights = selectedInsights.filter(isActionableReconciliationInsight);
  const confidence = selectedRequest ? getPaymentConfidenceLabel(selectedInsights, selectedRequest) : "No Provider Activity";
  const failureCount = exceptionQueue.filter((item) => item.insight.code === "webhook_processing_failed").length;
  const duplicateCount = exceptionQueue.filter((item) => item.insight.code.includes("duplicate")).length;
  const manualReviewCount = exceptionQueue.filter((item) => item.insight.severity === "high").length;

  function handleReviewAction(action, insight) {
    if (!selectedRequest || !insight) return;
    const activeStaffUser = getActiveStaffUser();
    upsertPaymentReconciliationReview({
      reviewKey: buildReconciliationReviewKey(selectedRequest, insight),
      paymentRequest: selectedRequest,
      insight,
      action,
      staffUserId: activeStaffUser?.id || "",
    });
    setRefreshKey((value) => value + 1);
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
            Payments
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Payment Reconciliation</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "780px" }}>
            Review Square payment exceptions, duplicate payments, webhook warnings, overpayments, and manual payment conflicts before production release.
          </p>
        </div>
        <Link
          to="/admin/financial"
          style={{
            alignSelf: "flex-start",
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "11px 14px",
            color: "#0f172a",
            fontWeight: 800,
            textDecoration: "none",
            background: "#ffffff",
          }}
        >
          Back to Payments
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <SectionCard title={exceptionQueue.length} description="Open Exceptions">Exception Queue</SectionCard>
        <SectionCard title={manualReviewCount} description="Manual Review">High-priority payment issues</SectionCard>
        <SectionCard title={duplicateCount} description="Duplicate Signals">Duplicate payment or webhook warnings</SectionCard>
        <SectionCard title={failureCount} description="Webhook Failures">Recoverable processing failures</SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 0.9fr) minmax(420px, 1.4fr)", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Payment Exception Queue" description="Items requiring owner review. Resolved and ignored issues leave the active queue but remain in the audit trail.">
          {!exceptionQueue.length ? (
            <EmptyState title="No open payment exceptions." detail="Duplicate, failed, delayed, mismatched, or manual-review payment issues will appear here." />
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {exceptionQueue.map((item) => {
                const palette = tonePalette(getInsightTone(item.insight));
                const active = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${active ? palette.color : palette.border}`,
                      borderRadius: "14px",
                      padding: "14px",
                      background: active ? palette.background : "#ffffff",
                      display: "grid",
                      gap: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <strong style={{ color: palette.color }}>{item.insight.label}</strong>
                    <span style={{ color: "#0f172a", fontWeight: 800 }}>{item.paymentRequest.request_number}</span>
                    <span style={{ color: "#64748b", fontSize: "13px" }}>{item.paymentRequest.order_number || "No order"} · {item.confidence}</span>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Review Detail" description="Resolve the selected exception after checking the request, payment timeline, and Square metadata.">
          {!selectedRequest ? (
            <EmptyState title="No exception selected." detail="Select an item from the queue to review payment evidence." />
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                <div><strong>{selectedRequest.request_number}</strong><p style={{ margin: "4px 0 0", color: "#64748b" }}>Request</p></div>
                <div><strong>{selectedRequest.order_number || "No order"}</strong><p style={{ margin: "4px 0 0", color: "#64748b" }}>Order</p></div>
                <div><strong>{money(selectedRequest.amount_requested)}</strong><p style={{ margin: "4px 0 0", color: "#64748b" }}>Requested</p></div>
                <div><strong>{money(selectedRequest.amount_paid)}</strong><p style={{ margin: "4px 0 0", color: "#64748b" }}>Paid</p></div>
                <div><strong>{confidence}</strong><p style={{ margin: "4px 0 0", color: "#64748b" }}>Confidence</p></div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link to={`/admin/financial/requests/${selectedRequest.id}`} style={{ color: "#0f172a", fontWeight: 800 }}>
                  View Payment Request
                </Link>
                {selectedRequest.order_number ? (
                  <Link to={`/admin/orders/${selectedRequest.order_number}`} style={{ color: "#0f172a", fontWeight: 800 }}>
                    View Order
                  </Link>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {actionableInsights.map((insight) => {
                  const palette = tonePalette(getInsightTone(insight));
                  return (
                    <article key={`${insight.code}-${insight.detail}`} style={{ border: `1px solid ${palette.border}`, borderRadius: "14px", padding: "14px", background: palette.background }}>
                      <strong style={{ color: palette.color }}>{insight.label}</strong>
                      <p style={{ margin: "5px 0 12px", color: "#475569" }}>{insight.detail}</p>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => handleReviewAction("mark_reviewed", insight)} style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "9px 11px", background: "#ffffff", fontWeight: 800 }}>Mark Reviewed</button>
                        <button type="button" onClick={() => handleReviewAction("resolve_duplicate", insight)} style={{ border: "none", borderRadius: "10px", padding: "9px 11px", background: "#166534", color: "#ffffff", fontWeight: 800 }}>Resolve Duplicate</button>
                        <button type="button" onClick={() => handleReviewAction("ignore_false_positive", insight)} style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "9px 11px", background: "#ffffff", fontWeight: 800 }}>Ignore False Positive</button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <SectionCard title="Payment Timeline" description="Webhook, payment, and reconciliation events connected to this request.">
                {!relatedEvents.length ? <EmptyState title="No payment timeline." /> : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {relatedEvents.map((event) => (
                      <article key={event.id} style={{ borderLeft: "4px solid #cbd5e1", paddingLeft: "12px" }}>
                        <strong>{event.summary || event.event_type}</strong>
                        <div style={{ color: "#64748b", fontSize: "13px", marginTop: "3px" }}>{event.event_source || "system"} · {formatDateTime(event.created_at)}</div>
                      </article>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Square Metadata" description="Provider identifiers and webhook metadata available for Square dashboard comparison.">
                <div style={{ display: "grid", gap: "8px", color: "#334155", fontSize: "14px" }}>
                  {relatedPayments.map((payment) => (
                    <div key={payment.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", background: "#f8fafc" }}>
                      <strong>{payment.payment_number}</strong>
                      <div>Square Payment ID: {payment.provider_payment_id || "—"}</div>
                      <div>Provider Status: {payment.provider_status || payment.status || "—"}</div>
                      <div>Idempotency Key: {payment.idempotency_key || "—"}</div>
                    </div>
                  ))}
                  {!relatedPayments.length ? <span>No provider payment records yet.</span> : null}
                </div>
              </SectionCard>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
