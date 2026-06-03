import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  EmptyState,
  MetricCard,
  PortalPage,
  RecordList,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

function countRequestsByStatus(requests = [], status) {
  return requests.filter(
    (request) => String(request.request_completion_status || "").trim().toLowerCase() === status
  ).length;
}

export default function CustomerPortalOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession } = useOutletContext();
  const { requests, orders, archivedOrders } = useCustomerPortalData(customerSession);
  const renderCountRef = useRef(0);
  const flashMessage = location.state?.flashMessage || "";
  const createdOrderNumber = location.state?.createdOrderNumber || "";
  const pendingRequestCount = countRequestsByStatus(requests, "pending_completion");
  const awaitingArtworkCount = countRequestsByStatus(requests, "awaiting_artwork");
  const readyForReviewCount = countRequestsByStatus(requests, "ready_for_review");

  renderCountRef.current += 1;

  useEffect(() => {
    if (!location.state?.flashMessage) return;

    const nextState = { ...location.state };
    delete nextState.flashMessage;
    delete nextState.createdOrderNumber;

    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    console.debug("[portal] CustomerPortalOrders render", {
      renderCount: renderCountRef.current,
      requestCount: requests.length,
      activeOrderCount: orders.length,
      archivedOrderCount: archivedOrders.length,
      requestNumbers: requests.map((request) => request.order_number || request.id || "unknown"),
      orderNumbers: orders.map((order) => order.order_number || order.id || "unknown"),
    });
  }, [archivedOrders, orders, requests]);

  return (
    <PortalPage
      eyebrow="My Requests"
      title="Your requests and active work"
      description="Open an existing request, continue artwork completion, and follow what Tee & Co is actively reviewing or producing for your account."
    >
      {flashMessage ? (
        <div
          style={{
            borderRadius: "20px",
            border: "1px solid #a7f3d0",
            background: "#ecfdf5",
            padding: "16px 18px",
            color: "#115e59",
          }}
        >
          <strong style={{ display: "block", fontSize: "16px" }}>
            Request saved
          </strong>
          <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
            {flashMessage}
            {createdOrderNumber ? ` Reference: ${createdOrderNumber}.` : ""}
          </p>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Requests"
          value={requests.length}
          helper="Customer-created requests attached to this account."
        />
        <MetricCard
          label="Action Needed"
          value={pendingRequestCount + awaitingArtworkCount}
          helper="Requests waiting on completion or artwork from you."
        />
        <MetricCard
          label="Ready"
          value={readyForReviewCount}
          helper="Requests that Tee & Co can review right now."
        />
      </div>

      <SectionCard
        title="Request Activity"
        subtitle="Every customer-created intake record appears here, regardless of whether it started in the storefront, project flow, or customer portal."
      >
        {requests.length ? (
          <RecordList records={requests} type="quotes" />
        ) : (
          <EmptyState
            title="No requests yet"
            description="Start a request whenever you are ready. It will appear here so you can resume artwork completion and track progress."
            actionLabel="Start New Order"
            actionTo="/portal/request-order"
          />
        )}
      </SectionCard>

      {orders.length ? (
        <SectionCard
          title="Production Orders"
          subtitle="Once Tee & Co moves approved work into operational production, those live records appear here."
        >
          <RecordList records={orders} type="orders" />
        </SectionCard>
      ) : null}

      {archivedOrders.length ? (
        <SectionCard
          title="Order History"
          subtitle="Completed or canceled records are moved here so your main order view stays focused on current work."
        >
          <RecordList records={archivedOrders} type="orders" />
        </SectionCard>
      ) : null}
    </PortalPage>
  );
}
