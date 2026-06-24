import { Link, useOutletContext, useParams } from "react-router-dom";
import { formatShortDate } from "../lib/dateFormatting";
import {
  EmptyState,
  PortalPage,
  SectionCard,
  DetailPair,
} from "./CustomerPortalShared";
import {
  formatPaymentRequestType,
  getCustomerPaymentStatusLabel,
} from "./customerPortalPayments";
import { formatCurrency, useCustomerPortalData } from "./useCustomerPortalData";
import {
  buildPortalOrderTimeline,
  resolvePortalNextAction,
} from "./portalOrderDetail";

function TimelineStep({ step }) {
  return (
    <div
      style={{
        borderRadius: "14px",
        border: step.complete ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
        background: step.complete ? "#f0fdf4" : "#f8fafc",
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <strong style={{ color: "#0f172a" }}>{step.label}</strong>
      <span style={{ color: step.complete ? "#166534" : "#64748b", fontWeight: 800 }}>
        {step.complete ? "Complete" : "Pending"}
      </span>
    </div>
  );
}

export default function CustomerPortalOrderDetail() {
  const { orderNumber } = useParams();
  const decodedOrderNumber = decodeURIComponent(orderNumber || "");
  const { customerSession } = useOutletContext();
  const portalData = useCustomerPortalData(customerSession);

  const order =
    portalData.allOrders.find(
      (record) => String(record.order_number || "") === decodedOrderNumber
    ) || null;

  if (!order) {
    return (
      <PortalPage
        eyebrow="Order Detail"
        title="Order not found"
        description="We could not find that order in your portal account."
      >
        <EmptyState
          title="Order not available"
          description="Return to your order list to continue managing your active requests."
          actionLabel="Back to My Orders"
          actionTo="/portal/orders"
        />
      </PortalPage>
    );
  }

  const paymentRequests = portalData.paymentRequests.filter(
    (request) => request.order_number === order.order_number
  );
  const payments = portalData.payments.filter(
    (payment) => payment.order_number === order.order_number
  );
  const paymentRequestIds = new Set(paymentRequests.map((request) => request.id));
  const paymentIds = new Set(payments.map((payment) => payment.id));
  const paymentEvents = portalData.paymentEvents.filter(
    (event) =>
      event.order_number === order.order_number ||
      paymentRequestIds.has(event.payment_request_id) ||
      paymentIds.has(event.payment_id)
  );

  const sortedPaymentRequests = [...paymentRequests].sort(
    (left, right) =>
      new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  );
  const nextAction = resolvePortalNextAction(order, sortedPaymentRequests);
  const timeline = buildPortalOrderTimeline(order, paymentRequests, payments, paymentEvents);
  const latestPaymentRequest = sortedPaymentRequests[0] || null;

  return (
    <PortalPage
      eyebrow="Order Detail"
      title={`Order ${order.order_number}`}
      description="Use this single page to review your request, artwork, approvals, payments, and production progress."
    >
      <SectionCard title="Next Action" subtitle="What you should do next">
        <div
          style={{
            borderRadius: "18px",
            border: "1px solid #a7f3d0",
            background: "#ecfdf5",
            padding: "14px 16px",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong style={{ fontSize: "18px", color: "#115e59" }}>{nextAction}</strong>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              to="/portal/orders"
              style={{
                display: "inline-flex",
                alignItems: "center",
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
              Back to My Orders
            </Link>
            {latestPaymentRequest ? (
              <Link
                to={`/portal/payments/${encodeURIComponent(latestPaymentRequest.id)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "40px",
                  borderRadius: "999px",
                  background: "#0f766e",
                  color: "#ffffff",
                  padding: "9px 14px",
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                View Payment Request
              </Link>
            ) : null}
            <Link
              to={`/portal/orders/${encodeURIComponent(order.order_number)}/artwork`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "40px",
                borderRadius: "999px",
                border: "1px solid #bfdbfe",
                background: "#ffffff",
                color: "#1e3a8a",
                padding: "9px 14px",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Manage Artwork
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Request Information" subtitle="Core request details for this order.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <DetailPair label="Order Number" value={order.order_number} />
          <DetailPair label="Item" value={order.garment || "Custom order"} />
          <DetailPair label="Quantity" value={order.qty || 0} />
          <DetailPair label="Requested" value={order.created_at ? formatShortDate(order.created_at) : "Recently"} />
          <DetailPair label="Due Date" value={order.due_date ? formatShortDate(order.due_date) : "Scheduling in progress"} />
          <DetailPair label="Total" value={formatCurrency(order.total_amount || order.total || 0)} />
        </div>
      </SectionCard>

      <SectionCard title="Quote, Artwork, and Approval" subtitle="Current quote and artwork approval workflow status.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <DetailPair label="Quote Information" value={order.quote_status || "In Review"} />
          <DetailPair label="Artwork Status" value={order.artwork_approval_status || "Pending Review"} />
          <DetailPair label="Approval Status" value={order.quote_status || "Pending"} />
          <DetailPair label="Artwork Files" value={Array.isArray(order.artwork_files) ? order.artwork_files.length : 0} />
        </div>
      </SectionCard>

      <SectionCard title="Payment and Production" subtitle="Payment status from payment requests and current production state.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <DetailPair
            label="Payment Status"
            value={latestPaymentRequest ? getCustomerPaymentStatusLabel(latestPaymentRequest) : "No requests yet"}
          />
          <DetailPair
            label="Latest Request"
            value={latestPaymentRequest ? formatPaymentRequestType(latestPaymentRequest.request_type) : "Not requested"}
          />
          <DetailPair label="Balance Remaining" value={formatCurrency(order.balance_due || 0)} />
          <DetailPair label="Production Status" value={order.status || "In Progress"} />
          <DetailPair label="Pickup Status" value={order.pickup_status || "Not Ready"} />
          <DetailPair label="Payments Recorded" value={payments.length} />
        </div>
      </SectionCard>

      <SectionCard title="Activity Timeline" subtitle="Consolidated progress from request through completion.">
        <div style={{ display: "grid", gap: "8px" }}>
          {timeline.map((step) => (
            <TimelineStep key={step.label} step={step} />
          ))}
        </div>
      </SectionCard>
    </PortalPage>
  );
}
