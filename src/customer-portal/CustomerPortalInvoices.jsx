import { useOutletContext } from "react-router-dom";
import {
  EmptyState,
  MetricCard,
  PortalPage,
  RecordList,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalInvoices() {
  const { customerSession } = useOutletContext();
  const { invoices, summary } = useCustomerPortalData(customerSession);

  return (
    <PortalPage
      eyebrow="Invoices"
      title="Invoices and balances"
      description="Check invoice status, due timing, and remaining balance in one calm billing view."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Invoices"
          value={invoices.length}
          helper="All invoice-related records connected to your account."
        />
        <MetricCard
          label="Overdue"
          value={summary.overdueInvoiceCount}
          helper="Records currently marked overdue."
        />
        <MetricCard
          label="Open Balance"
          value={`$${summary.outstandingBalance.toFixed(2)}`}
          helper="Total remaining across your visible invoices."
        />
      </div>

      <SectionCard
        title="Billing Records"
        subtitle="Only your own invoices and balances are visible here."
      >
        {invoices.length ? (
          <RecordList records={invoices} type="invoices" />
        ) : (
          <EmptyState
            title="No invoice activity yet"
            description="Invoice details will appear here when billing begins on an order connected to your account."
          />
        )}
      </SectionCard>
    </PortalPage>
  );
}
