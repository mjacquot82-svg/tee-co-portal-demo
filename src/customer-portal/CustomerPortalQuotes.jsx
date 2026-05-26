import { useOutletContext } from "react-router-dom";
import {
  EmptyState,
  PortalPage,
  RecordList,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalQuotes() {
  const { customerSession } = useOutletContext();
  const { quotes } = useCustomerPortalData(customerSession);

  return (
    <PortalPage
      eyebrow="Quotes"
      title="Quotes and approvals"
      description="Review quoted work, deposit progress, and approval-related statuses without stepping into operational workflow details."
    >
      <SectionCard
        title="Quote Records"
        subtitle="Quotes stay scoped to your account only."
      >
        {quotes.length ? (
          <RecordList records={quotes} type="quotes" />
        ) : (
          <EmptyState
            title="No quotes available"
            description="When Tee & Co creates or updates a quote tied to your account, it will appear here."
          />
        )}
      </SectionCard>
    </PortalPage>
  );
}
