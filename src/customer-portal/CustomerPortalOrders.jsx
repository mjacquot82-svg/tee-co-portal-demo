import { useOutletContext } from "react-router-dom";
import {
  EmptyState,
  MetricCard,
  PortalPage,
  RecordList,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalOrders() {
  const { customerSession } = useOutletContext();
  const { orders, archivedOrders, summary } = useCustomerPortalData(customerSession);

  return (
    <PortalPage
      eyebrow="My Orders"
      title="Your current business with Tee & Co"
      description="Follow active work, see the next clear step for each order, and keep an eye on any balance that still needs attention."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Orders"
          value={summary.orderCount}
          helper="Active orders currently in motion."
        />
        <MetricCard
          label="Ready"
          value={summary.readyForPickupCount}
          helper="Orders that are ready for pickup or final release."
        />
        <MetricCard
          label="Outstanding"
          value={`$${summary.outstandingBalance.toFixed(2)}`}
          helper="Balance still open across your account."
        />
      </div>

      <SectionCard
        title="Order Activity"
        subtitle="This view stays intentionally simple: just the active orders, current status, timing, and payment context you need."
      >
        {orders.length ? (
          <RecordList records={orders} type="orders" />
        ) : (
          <EmptyState
            title="No active orders right now"
            description="When a new order tied to your customer email or linked customer record moves into progress, it will appear here automatically."
          />
        )}
      </SectionCard>

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
