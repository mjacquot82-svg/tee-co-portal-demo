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
  getCustomerPaymentDueLabel,
  getCustomerPaymentStatusLabel,
  getEstimatedBalanceAfterPayment,
  getRemainingPaymentAmount,
  isOpenCustomerPaymentRequest,
} from "./customerPortalPayments";
import { formatCurrency, useCustomerPortalData } from "./useCustomerPortalData";
import {
  getArtworkDisplayName,
  getOrderArtworkReferenceNames,
  getUploadedOrderArtworkFiles,
} from "../lib/orderArtwork";
import {
  buildPortalOrderTimeline,
  resolveCustomerQuoteApprovalStatus,
  resolveCustomerQuoteStatus,
  resolvePortalNextActionDetails,
  resolvePortalOrderAttention,
} from "./portalOrderDetail";
import { getOrderLineItems, getOrderTotalQuantity } from "../lib/orderLineItems";
import { resolveCustomerOrderMilestone } from "./customerOrderMilestones";

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
  const uploadedArtworkFiles = getUploadedOrderArtworkFiles(order);
  const artworkReferenceNames = getOrderArtworkReferenceNames(order);
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
  const nextActionDetails = resolvePortalNextActionDetails(order, sortedPaymentRequests);
  const customerAttention = resolvePortalOrderAttention(order, sortedPaymentRequests);
  const customerMilestone = resolveCustomerOrderMilestone(order);
  const milestonePanel = customerMilestone.tone === "warning"
    ? { border: "#fde68a", background: "#fffbeb", color: "#92400e" }
    : customerMilestone.tone === "danger"
    ? { border: "#fecaca", background: "#fef2f2", color: "#b91c1c" }
    : customerMilestone.tone === "info"
    ? { border: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8" }
    : { border: "#a7f3d0", background: "#ecfdf5", color: "#166534" };
  const timeline = buildPortalOrderTimeline(order, paymentRequests, payments, paymentEvents);
  const latestPaymentRequest = sortedPaymentRequests[0] || null;
  const activePaymentRequest = sortedPaymentRequests.find(isOpenCustomerPaymentRequest) || null;

  return (
    <PortalPage
      eyebrow="Order Detail"
      title={`Order ${order.order_number}`}
      description="Use this page to review your order, artwork, payments, and production progress."
    >
      <SectionCard
        title={customerMilestone.label}
        subtitle="Where your order is now"
      >
        <div
          style={{
            borderRadius: "18px",
            border: `1px solid ${milestonePanel.border}`,
            background: milestonePanel.background,
            padding: "14px 16px",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong style={{ fontSize: "20px", color: milestonePanel.color }}>{customerMilestone.reassurance}</strong>
          <p style={{ margin: 0, color: milestonePanel.color, lineHeight: 1.55 }}>{customerMilestone.progress}</p>
          <span style={{ fontWeight: 800, color: milestonePanel.color }}>
            {customerAttention.requiresAction ? `Your action: ${customerAttention.label}` : "No action required"}
          </span>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {customerAttention.requiresAction ? (
              <Link
                to={nextActionDetails.to}
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
                {nextActionDetails.label}
              </Link>
            ) : null}
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
            {latestPaymentRequest && nextActionDetails.actionType !== "payment_request" ? (
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
          <DetailPair label="Items" value={getOrderLineItems(order).map((item) => `${item.garment} (${item.quantity})`).join(", ") || order.garment || "Custom order"} />
          <DetailPair label="Quantity" value={getOrderTotalQuantity(order)} />
          <DetailPair label="Requested" value={order.created_at ? formatShortDate(order.created_at) : "Recently"} />
          <DetailPair
            label={order.due_date ? "Due Date" : "Timing"}
            value={order.due_date ? formatShortDate(order.due_date) : "Tee & Co is confirming your schedule"}
          />
          <DetailPair label="Total" value={formatCurrency(order.total_amount || order.total || 0)} />
        </div>
      </SectionCard>

      <SectionCard title="Order and Artwork" subtitle="Current order review and artwork status.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <DetailPair label="Order Status" value={resolveCustomerQuoteStatus(order)} />
          <DetailPair label="Artwork Choice" value={order.artwork_requirement || "Not selected"} />
          <DetailPair label="Artwork Status" value={order.artwork_status || order.artwork_approval_status || "Pending Review"} />
          <DetailPair label="Customer Action" value={resolveCustomerQuoteApprovalStatus(order)} />
          <DetailPair label="Customer Selected" value={artworkReferenceNames.join(", ") || "No filename provided"} />
          <DetailPair label="Artwork Uploaded" value={uploadedArtworkFiles.map((file) => getArtworkDisplayName(file)).join(", ") || "None"} />
        </div>
        {!uploadedArtworkFiles.length && artworkReferenceNames.length ? (
          <p style={{ margin: 0, color: "#92400e", lineHeight: 1.6, fontWeight: 700 }}>
            The selected filename is a reference only. Tee & Co is still waiting for the actual artwork file.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Payment and Production" subtitle="Payment status from payment requests and current production state.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          {activePaymentRequest ? (
            <>
              <DetailPair
                label={getCustomerPaymentDueLabel(activePaymentRequest)}
                value={formatCurrency(getRemainingPaymentAmount(activePaymentRequest))}
              />
              <DetailPair label="Payment Status" value={getCustomerPaymentStatusLabel(activePaymentRequest)} />
              <DetailPair label="Payment Type" value={formatPaymentRequestType(activePaymentRequest.request_type)} />
              <DetailPair
                label="Estimated Balance After Payment"
                value={formatCurrency(getEstimatedBalanceAfterPayment(order.balance_due, activePaymentRequest))}
              />
              <div style={{ gridColumn: "1 / -1", color: "#475569", fontSize: "13px", lineHeight: 1.55 }}>
                Additional payment may be requested later if an order balance remains.
              </div>
            </>
          ) : (
            <div style={{ gridColumn: "1 / -1", borderRadius: "14px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", padding: "14px 16px" }}>
              <strong style={{ display: "block" }}>No payment is required right now.</strong>
              <span style={{ display: "block", marginTop: "5px", lineHeight: 1.55 }}>
                Tee & Co has not requested payment. If payment is needed after review, it will become available here.
              </span>
            </div>
          )}
          <DetailPair label="Current Milestone" value={resolveCustomerQuoteStatus(order)} />
          <DetailPair label="Pickup Status" value={order.pickup_status || "Not Ready"} />
          <DetailPair label="Payments Recorded" value={payments.length} />
        </div>
      </SectionCard>

      <SectionCard
        title="Activity Timeline"
        subtitle="Consolidated progress from request through completion."
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div id="activity-timeline" role="region" aria-label="Activity timeline steps">
            {timeline.map((step) => (
              <TimelineStep key={step.label} step={step} />
            ))}
          </div>
        </div>
      </SectionCard>
    </PortalPage>
  );
}
