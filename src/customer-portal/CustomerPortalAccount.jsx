import { Link, useOutletContext } from "react-router-dom";
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
  const { profile, requests, orders, invoices } = useCustomerPortalData(customerSession);
  const actionNeededCount = requests.filter((request) => {
    const status = String(request.request_completion_status || "").trim().toLowerCase();
    return status === "pending_completion" || status === "awaiting_artwork";
  }).length;

  return (
    <PortalPage
      eyebrow="Account"
      title="Account and profile"
      description="Review the contact details connected to your portal access and see a lightweight summary of current customer work."
    >
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
          helper="Customer requests submitted from this account."
        />
        <MetricCard
          label="Action Needed"
          value={actionNeededCount}
          helper="Requests waiting on completion or artwork from you."
        />
        <MetricCard
          label="Invoices"
          value={invoices.length}
          helper="Customer-visible billing records available."
        />
      </div>

      <SectionCard
        title="Profile Information"
        subtitle="These contact details help Tee & Co associate your storefront requests, approvals, and invoices with the right account."
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
            value={profile?.phone || customerSession.phone || "Contact Tee & Co to add"}
          />
          <DetailPair label="Company" value={profile?.company || "Contact Tee & Co to add"} />
          <DetailPair label="Active Orders" value={orders.length} />
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <a
            href="mailto:hello@teeandco.com?subject=Update%20my%20customer%20profile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40px",
              borderRadius: "999px",
              padding: "0 16px",
              textDecoration: "none",
              fontWeight: 800,
              background: "#0f766e",
              color: "#ffffff",
            }}
          >
            Request Profile Update
          </a>
          <Link
            to="/portal/request-order"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40px",
              borderRadius: "999px",
              padding: "0 16px",
              textDecoration: "none",
              fontWeight: 800,
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              background: "#ffffff",
            }}
          >
            Open Request Hub
          </Link>
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
