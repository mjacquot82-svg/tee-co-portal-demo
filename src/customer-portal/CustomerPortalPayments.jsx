import { Link, useOutletContext } from "react-router-dom";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatShortDate } from "../lib/dateFormatting";
import {
  formatPaymentMethod,
  formatPaymentRequestType,
  getCustomerPaymentStatusLabel,
  getRemainingPaymentAmount,
} from "./customerPortalPayments";
import { hasProviderCheckoutUrl } from "../services/squareService";
import {
  EmptyState,
  MetricCard,
  PortalPage,
  SectionCard,
  DetailPair,
} from "./CustomerPortalShared";
import { formatCurrency, useCustomerPortalData } from "./useCustomerPortalData";

function PaymentRequestCard({ paymentRequest }) {
  const statusLabel = getCustomerPaymentStatusLabel(paymentRequest);
  const remainingAmount = getRemainingPaymentAmount(paymentRequest);
  const canPayNow = hasProviderCheckoutUrl(paymentRequest);

  return (
    <article
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
          gap: "12px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ color: "#0f172a", fontSize: "18px" }}>
            {paymentRequest.request_number}
          </strong>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <PaymentStatusBadge status={statusLabel} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {canPayNow ? (
            <a
              href={paymentRequest.provider_checkout_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "40px",
                borderRadius: "999px",
                background: "#0f766e",
                color: "#ffffff",
                padding: "10px 14px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Pay Now
            </a>
          ) : null}
          <Link
            to={`/portal/payments/${encodeURIComponent(paymentRequest.id)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "40px",
              borderRadius: "999px",
              border: canPayNow ? "1px solid #cbd5e1" : "none",
              background: canPayNow ? "#ffffff" : "#0f766e",
              color: canPayNow ? "#0f172a" : "#ffffff",
              padding: "10px 14px",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            View Details
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
        }}
      >
        <DetailPair label="Request Type" value={formatPaymentRequestType(paymentRequest.request_type)} />
        <DetailPair label="Amount Requested" value={formatCurrency(paymentRequest.amount_requested)} />
        <DetailPair label="Amount Paid" value={formatCurrency(paymentRequest.amount_paid)} />
        <DetailPair label="Remaining Amount" value={formatCurrency(remainingAmount)} />
        <DetailPair label="Date Created" value={formatShortDate(paymentRequest.created_at)} />
        <DetailPair
          label="Due Date"
          value={paymentRequest.due_at ? formatShortDate(paymentRequest.due_at) : "No due date"}
        />
      </div>
    </article>
  );
}

function PaymentHistoryCard({ payment }) {
  return (
    <article
      style={{
        borderRadius: "20px",
        border: "1px solid #dbe4ee",
        background: "#ffffff",
        padding: "18px",
        display: "grid",
        gap: "12px",
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
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ color: "#0f172a", fontSize: "18px" }}>
            {payment.payment_number}
          </strong>
          <PaymentStatusBadge status={getCustomerPaymentStatusLabel(payment)} />
        </div>
        <strong style={{ color: "#0f172a", fontSize: "20px" }}>
          {formatCurrency(payment.amount)}
        </strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
        }}
      >
        <DetailPair label="Order Number" value={payment.order_number || "No related order"} />
        <DetailPair label="Payment Type" value={formatPaymentRequestType(payment.payment_type)} />
        <DetailPair label="Method" value={formatPaymentMethod(payment.method)} />
        <DetailPair label="Date Paid" value={formatShortDate(payment.created_at || payment.captured_at)} />
      </div>
    </article>
  );
}

export default function CustomerPortalPayments() {
  const { customerSession } = useOutletContext();
  const {
    openPaymentRequests,
    paymentRequests,
    payments,
    paymentSummary,
  } = useCustomerPortalData(customerSession);

  return (
    <PortalPage
      eyebrow="Payments"
      title="Payments and balances"
      description="Track open payment requests, review payment history, and pay outstanding Square checkout requests."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Open Requests"
          value={openPaymentRequests.length}
          helper="Requests that still need your attention."
        />
        <MetricCard
          label="Amount Owing"
          value={formatCurrency(paymentSummary.amountOwing)}
          helper={
            paymentSummary.amountOwing > 0
              ? "Remaining across your visible payment requests."
              : "No outstanding balance right now."
          }
        />
        <MetricCard
          label="Total Paid"
          value={formatCurrency(paymentSummary.totalPaid)}
          helper="Recorded payments Tee & Co has already captured."
        />
        <MetricCard
          label="Payment Status"
          value={paymentSummary.paymentStatus}
          helper="A customer-friendly view of your current payment state."
        />
      </div>

      {paymentSummary.amountOwing <= 0 ? (
        <EmptyState
          title="No outstanding balance"
          description="You do not have any remaining balance across the payment requests currently visible in your portal."
        />
      ) : null}

      <SectionCard
        title="Open Payment Requests"
        subtitle="Review each request, see what has already been paid, and open the full detail timeline whenever you need context."
      >
        {openPaymentRequests.length ? (
          <div style={{ display: "grid", gap: "14px" }}>
            {openPaymentRequests.map((paymentRequest) => (
              <PaymentRequestCard key={paymentRequest.id} paymentRequest={paymentRequest} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No payment requests"
            description="When Tee & Co sends a deposit, balance, full payment, or custom request, it will appear here."
          />
        )}
      </SectionCard>

      <SectionCard
        title="Payment History"
        subtitle="Every recorded payment connected to your visible portal orders appears here."
      >
        {payments.length ? (
          <div style={{ display: "grid", gap: "14px" }}>
            {payments.map((payment) => (
              <PaymentHistoryCard key={payment.id} payment={payment} />
            ))}
          </div>
        ) : paymentRequests.length ? (
          <EmptyState
            title="No payment history"
            description="Payment requests exist, but Tee & Co has not recorded any payments against them yet."
          />
        ) : (
          <EmptyState
            title="No payment history"
            description="Recorded payments will appear here once Tee & Co logs them against your account."
          />
        )}
      </SectionCard>
    </PortalPage>
  );
}
