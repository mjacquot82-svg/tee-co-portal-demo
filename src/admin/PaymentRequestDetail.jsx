import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import OwnerNextActionCard from "../components/OwnerNextActionCard";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { formatDateTime } from "../lib/dateFormatting";
import { useStoredCustomers } from "../lib/customersStore";
import { useStoredOrders } from "../lib/ordersStore";
import {
  getPaymentRequestById,
  listPaymentEvents,
  listPayments,
  recordPaymentEvent,
  updatePaymentRequest,
} from "../lib/paymentsStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { deriveOwnerPaymentRequestNextAction } from "../orders/ownerWorkflowActions";
import {
  buildSquarePaymentRequestUpdates,
  createSquarePaymentLink,
  hasProviderCheckoutUrl,
} from "../services/squareService";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function DetailItem({ label, value, children }) {
  return (
    <div>
      <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>{label}</p>
      <div style={{ marginTop: "5px", color: "#0f172a", fontWeight: 800 }}>{children || value || "—"}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
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
      <h2 style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function PaymentRequestDetail() {
  const { requestId } = useParams();
  const [refreshToken, setRefreshToken] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  void refreshToken;
  const request = getPaymentRequestById(requestId);

  if (!request) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Payment request not found</h1>
        <Link to="/admin/financial">Back to Payments</Link>
      </div>
    );
  }

  const relatedOrder = request.order_number
    ? orders.find((order) => order.order_number === request.order_number)
    : null;
  const financials = relatedOrder ? normalizeOrderFinancials(relatedOrder) : null;
  const relatedCustomer =
    customers.find((customer) => customer.id === request.customer_id) || null;
  const requestPayments = listPayments().filter((payment) => payment.payment_request_id === request.id);
  const requestEvents = listPaymentEvents().filter(
    (event) => event.payment_request_id === request.id || requestPayments.some((payment) => payment.id === event.payment_id)
  );
  const nextAction = deriveOwnerPaymentRequestNextAction(request, financials);
  const squareLink = request.metadata?.square_payment_link || {};
  const linkCreated = Boolean(squareLink.created_at || request.provider_payment_link_id || request.provider_checkout_url);
  const linkStatus = squareLink.status || (hasProviderCheckoutUrl(request) ? "created" : "");

  async function handleNextAction(actionKey) {
    if (actionKey !== "mark_payment_request_sent") return;
    if (isSending) return;

    setIsSending(true);
    setFeedback("");
    const sentAt = new Date().toISOString();
    let linkUpdates = {};

    try {
      const providerLink = await createSquarePaymentLink(request);
      linkUpdates = buildSquarePaymentRequestUpdates(request, providerLink);

      recordPaymentEvent({
        payment_request_id: request.id,
        order_number: request.order_number,
        event_type: "square_payment_link_created",
        event_source: "system",
        summary: `Square payment link created for ${request.request_number}.`,
        payload: { providerLink },
        created_at: sentAt,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Square payment link creation failed.");
      setIsSending(false);
      return;
    }

    const updatedRequest = updatePaymentRequest(request.id, {
      ...linkUpdates,
      status: "sent",
      sent_at: sentAt,
    });

    recordPaymentEvent({
      payment_request_id: request.id,
      order_number: request.order_number,
      event_type: "payment_request_sent",
      event_source: "staff",
      summary: `Payment request ${request.request_number} marked sent to customer.`,
      created_at: sentAt,
    });

    setFeedback(
      updatedRequest
        ? `${updatedRequest.request_number} marked sent with a Square payment link.`
        : "Payment request marked sent."
    );
    setIsSending(false);
    setRefreshToken((current) => current + 1);
  }

  return (
    <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Payment Request
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>{request.request_number}</h1>
          <p style={{ margin: 0, color: "#64748b" }}>{request.description || "Staff-managed payment request"}</p>
        </div>
        <Link
          to="/admin/financial"
          style={{
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

      <SectionCard title="Request Summary">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
          <DetailItem label="Status">
            <PaymentStatusBadge status={String(request.status || "open").replace(/_/g, " ")} />
          </DetailItem>
          <DetailItem label="Type" value={String(request.request_type || "").replace(/_/g, " ")} />
          <DetailItem label="Amount Requested" value={money(request.amount_requested)} />
          <DetailItem label="Amount Paid" value={money(request.amount_paid)} />
          <DetailItem label="Remaining" value={money(Math.max(0, Number(request.amount_requested || 0) - Number(request.amount_paid || 0)))} />
          <DetailItem label="Created" value={formatDateTime(request.created_at)} />
        </div>
      </SectionCard>

      <OwnerNextActionCard action={nextAction} onAction={handleNextAction} />

      {feedback ? (
        <section
          aria-live="polite"
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: "16px",
            background: "#ecfdf5",
            color: "#166534",
            padding: "14px 16px",
            fontWeight: 800,
          }}
        >
          {feedback}
        </section>
      ) : null}

      <SectionCard title="Related Records">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <DetailItem label="Order">
            {relatedOrder ? (
              <Link to={`/admin/orders/${relatedOrder.order_number}`} style={{ color: "#0f172a" }}>
                {relatedOrder.order_number}
              </Link>
            ) : (
              "No related order"
            )}
          </DetailItem>
          <DetailItem label="Customer">
            {relatedCustomer ? (
              <Link to={`/admin/customers/${relatedCustomer.id}`} style={{ color: "#0f172a" }}>
                {relatedCustomer.name || relatedCustomer.company || relatedCustomer.id}
              </Link>
            ) : (
              request.metadata?.customer_name || "Customer"
            )}
          </DetailItem>
          <DetailItem label="Order Balance" value={financials ? money(financials.balance_due) : "—"} />
          <DetailItem
            label="Order Payment State"
            value={financials?.canonical_payment_state || financials?.payment_collection_state || "—"}
          />
        </div>
      </SectionCard>

      <SectionCard title="Provider Link">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <DetailItem label="Payment Provider" value={request.payment_provider || "manual"} />
          <DetailItem label="Link Created" value={linkCreated ? formatDateTime(squareLink.created_at || request.updated_at) : "Not created"} />
          <DetailItem label="Provider Payment Link ID" value={request.provider_payment_link_id || "—"} />
          <DetailItem label="Link Status" value={linkStatus || "Not available"} />
        </div>
        <DetailItem label="Checkout URL">
          {hasProviderCheckoutUrl(request) ? (
            <a href={request.provider_checkout_url} target="_blank" rel="noreferrer" style={{ color: "#0f766e", overflowWrap: "anywhere" }}>
              {request.provider_checkout_url}
            </a>
          ) : (
            "No provider checkout link yet"
          )}
        </DetailItem>
      </SectionCard>

      <SectionCard title="Associated Payments">
        {!requestPayments.length ? (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: "16px", padding: "18px", color: "#64748b" }}>
            No payment records are associated with this request yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {requestPayments.map((payment) => (
              <article key={payment.id} style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px", display: "grid", gap: "6px" }}>
                <strong>{payment.payment_number}</strong>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", color: "#64748b" }}>
                  <span>{money(payment.amount)}</span>
                  <span>{payment.method}</span>
                  <span>{payment.status}</span>
                  <span>{formatDateTime(payment.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Timeline">
        {!requestEvents.length ? (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: "16px", padding: "18px", color: "#64748b" }}>
            No payment events have been recorded yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {requestEvents.map((event) => (
              <article key={event.id} style={{ borderLeft: "4px solid #cbd5e1", padding: "4px 0 4px 14px" }}>
                <strong style={{ color: "#0f172a" }}>{event.summary || event.event_type}</strong>
                <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                  {event.event_source || "system"} · {formatDateTime(event.created_at)}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
