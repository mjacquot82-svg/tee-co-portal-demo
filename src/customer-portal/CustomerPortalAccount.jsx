import { useOutletContext } from "react-router-dom";
import {
  DetailPair,
  EmptyState,
  MetricCard,
  PortalPage,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalAccount() {
  const { customerSession } = useOutletContext();
  const { profile, summary } = useCustomerPortalData(customerSession);

  return (
    <PortalPage
      eyebrow="Account"
      title="Account and profile"
      description="Your profile section stays lightweight: basic contact details, customer record linkage, and a quick account summary."
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
          helper="Visible orders attached to this account."
        />
        <MetricCard
          label="Account Total"
          value={`$${summary.totalValue.toFixed(2)}`}
          helper="Combined visible order value."
        />
        <MetricCard
          label="Balance Due"
          value={`$${summary.outstandingBalance.toFixed(2)}`}
          helper="Current balance still open."
        />
      </div>

      <SectionCard
        title="Profile Details"
        subtitle="This is the customer-facing account record connected to your portal access."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <DetailPair
            label="Name"
            value={profile?.name || customerSession.displayName || "Customer Account"}
          />
          <DetailPair label="Email" value={profile?.email || customerSession.email || "—"} />
          <DetailPair
            label="Phone"
            value={profile?.phone || customerSession.phone || "Not added yet"}
          />
          <DetailPair label="Company" value={profile?.company || "Not added yet"} />
        </div>

        {!profile ? (
          <EmptyState
            title="Customer record still syncing"
            description="Your account exists and your portal access is active. A linked customer profile will appear here once order history or customer records are associated with this email."
          />
        ) : null}
      </SectionCard>
    </PortalPage>
  );
}
