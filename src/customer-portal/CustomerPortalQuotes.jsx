import { useEffect, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  EmptyState,
  PortalPage,
  RecordList,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalQuotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession } = useOutletContext();
  const { quotes } = useCustomerPortalData(customerSession);
  const [flashMessage, setFlashMessage] = useState(() => location.state?.flashMessage || "");
  const [createdOrderNumber, setCreatedOrderNumber] = useState(
    () => location.state?.createdOrderNumber || ""
  );

  useEffect(() => {
    if (!location.state?.flashMessage) return;

    setFlashMessage(location.state.flashMessage || "");
    setCreatedOrderNumber(location.state.createdOrderNumber || "");

    const nextState = { ...location.state };
    delete nextState.flashMessage;
    delete nextState.createdOrderNumber;

    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });
  }, [location.pathname, location.state, navigate]);

  return (
    <PortalPage
      eyebrow="Quotes"
      title="Quote requests, quotes, and approvals"
      description="Start lightweight requests from the portal, then review quoted work, deposit progress, and approval-related statuses without stepping into operational workflow details."
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
            Request received
          </strong>
          <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
            {flashMessage}
            {createdOrderNumber ? ` Reference: ${createdOrderNumber}.` : ""}
          </p>
        </div>
      ) : null}

      <SectionCard
        title="Quote Records"
        subtitle="Requests and formal quotes stay scoped to your account only."
      >
        {quotes.length ? (
          <RecordList records={quotes} type="quotes" />
        ) : (
          <EmptyState
            title="No quote requests yet"
            description="Start a request from the portal and Tee & Co will move it into the quote workflow for review."
            actionLabel="Start New Order"
            actionTo="/portal/request-order"
          />
        )}
      </SectionCard>
    </PortalPage>
  );
}
