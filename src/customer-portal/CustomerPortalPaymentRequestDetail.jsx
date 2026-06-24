import { Link, useOutletContext, useParams } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import {
  findPaymentRequestForOrder,
  formatPaymentMethod,
  formatPaymentRequestType,
  getCustomerPaymentStatusLabel,
  getRemainingPaymentAmount,
} from "./customerPortalPayments";
import { EmptyState, PortalPage, SectionCard, DetailPair } from "./CustomerPortalShared";
import { formatCurrency, useCustomerPortalData } from "./useCustomerPortalData";

function TimelineItem({ event }) {
  return (
    <article
      style={{
        borderLeft: "4px solid #cbd5e1",
        padding: "4px 0 4px 14px",
        display: "grid",
        gap: "4px",
      }}
    >
      <strong style={{ color: "#0f172a" }}>{event.summary || event.event_type}</strong>
      <span style={{ color: "#64748b", fontSize: "13px" }}>
        {(event.event_source || "system").replace(/_/g, " ")} · {formatDateTime(event.created_at)}
      </span>
    </article>
  );
}

function RelatedPaymentCard({ payment }) {
  return (
    <article
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "16px",
        display: "grid",
        gap: "10px",
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
        <div style={{ display: "grid", gap: "4px" }}>
          <strong style={{ color: "#0f172a" }}>{payment.payment_number}</strong>
          <PaymentStatusBadge status={getCustomerPaymentStatusLabel(payment)} />
        </div>
        <strong style={{ color: "#0f172a" }}>{formatCurrency(payment.amount)}</strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
        }}
      >
        <DetailPair label="Payment Type" value={formatPaymentRequestType(payment.payment_type)} />
        <DetailPair label="Method" value={formatPaymentMethod(payment.method)} />
        <DetailPair label="Recorded" value={formatShortDate(payment.created_at || payment.captured_at)} />
      </div>
    </article>
  );
}

export default function CustomerPortalPaymentRequestDetail() {
  const { requestId } = useParams();
  const { customerSession } = useOutletContext();
  const portalData = useCustomerPortalData(customerSession);
  const paymentRequest =
    portalData.paymentRequests.find(
      (request) => request.id === requestId || request.request_number === requestId
    ) || null;

  if (!paymentRequest) {
    return (
      <PortalPage
        eyebrow="Payments"
        title="Payment request not found"
        description="We could not find that payment request in your portal account."
      >
        <EmptyState
          title="Payment request not available"
          description="Return to your payments dashboard to review the requests currently connected to your account."
          actionLabel="Back to Payments"
          actionTo="/portal/payments"
        />
      </PortalPage>
    );
  }

  const relatedOrder =
    portalData.allOrders.find((order) => order.order_number === paymentRequest.order_number) || null;
  const relatedPayments = portalData.payments.filter(
    (payment) =>
      payment.payment_request_id === paymentRequest.id ||
      (!payment.payment_request_id &&
        payment.order_number &&
        payment.order_number === paymentRequest.order_number)
  );
  const relatedPaymentIds = new Set(relatedPayments.map((payment) => payment.id));
  const paymentTimeline = portalData.paymentEvents.filter(
    (event) =>
      event.payment_request_id === paymentRequest.id || relatedPaymentIds.has(event.payment_id)
  );
  const statusLabel = getCustomerPaymentStatusLabel(paymentRequest);
  const remainingAmount = getRemainingPaymentAmount(paymentRequest);
  const customerName =
    portalData.profile?.name ||
    portalData.profile?.company ||
    customerSession?.displayName ||
    paymentRequest.metadata?.customer_name ||
    "Customer";
  const relatedOrderRequest = findPaymentRequestForOrder(
    portalData.paymentRequests,
    paymentRequest.order_number
  );

  return (
    <PortalPage
      eyebrow="Payments"
      title={paymentRequest.request_number}
      description={paymentRequest.description || "Review the full payment request summary, timeline, and related payment records."}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        <Link
          to="/portal/payments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "42px",
            borderRadius: "999px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            padding: "10px 14px",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Back to Payments
        </Link>
      </div>

      <SectionCard title="Payment Request Detail" subtitle="The centralized payment request record remains the source of truth for this summary.">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <DetailPair label="Customer Name" value={customerName} />
          <DetailPair label="Order Number" value={paymentRequest.order_number || "No related order"} />
          <DetailPair label="Request Type" value={formatPaymentRequestType(paymentRequest.request_type)} />
          <DetailPair label="Amount Requested" value={formatCurrency(paymentRequest.amount_requested)} />
          <DetailPair label="Amount Paid" value={formatCurrency(paymentRequest.amount_paid)} />
          <DetailPair label="Remaining Amount" value={formatCurrency(remainingAmount)} />
          <DetailPair label="Status" value={<PaymentStatusBadge status={statusLabel} />} />
          <DetailPair label="Date Created" value={formatShortDate(paymentRequest.created_at)} />
          <DetailPair
            label="Due Date"
            value={paymentRequest.due_at ? formatShortDate(paymentRequest.due_at) : "No due date"}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {relatedOrder ? (
            <Link
              to={`/portal/orders#order-${encodeURIComponent(relatedOrder.order_number)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "42px",
                borderRadius: "999px",
                background: "#0f766e",
                color: "#ffffff",
                padding: "10px 14px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              View Related Order
            </Link>
          ) : null}
          {relatedOrderRequest && relatedOrderRequest.id !== paymentRequest.id ? (
            <Link
              to={`/portal/payments/${encodeURIComponent(relatedOrderRequest.id)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "42px",
                borderRadius: "999px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                padding: "10px 14px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              View Related Request
            </Link>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Related Payment Records" subtitle="Payments already recorded against this request appear below.">
        {relatedPayments.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {relatedPayments.map((payment) => (
              <RelatedPaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No payment records yet"
            description="Tee & Co has not recorded any payments against this request yet."
          />
        )}
      </SectionCard>

      <SectionCard title="Payment Timeline" subtitle="Every payment event connected to this request is shown in reverse chronological order.">
        {paymentTimeline.length ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {paymentTimeline.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No payment timeline yet"
            description="Payment timeline events will appear here as Tee & Co updates this request."
          />
        )}
      </SectionCard>
    </PortalPage>
  );
}
