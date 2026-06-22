import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  buildDepositContactHref,
  getDepositPaymentProviderConfig,
  isDepositActionRequired,
  resolveDepositAmount,
  resolveRemainingBalanceAfterDeposit,
} from "../lib/depositPaymentProviders";
import { updateStoredOrder } from "../lib/ordersStore";
import { formatShortDate } from "../lib/dateFormatting";
import { EmptyState, PortalPage, SectionCard, DetailPair } from "./CustomerPortalShared";
import { formatCurrency, useCustomerPortalData } from "./useCustomerPortalData";

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveDepositStatus(order = {}) {
  return (
    normalizeText(order.deposit_workflow_status) ||
    normalizeText(order.deposit?.status) ||
    normalizeText(order.invoice_status) ||
    normalizeText(order.quote_status) ||
    "Deposit Requested"
  );
}

function resolveDepositMessage(order = {}) {
  return (
    normalizeText(order.deposit?.last_requested_message) ||
    normalizeText(order.deposit_request_message) ||
    normalizeText(order.deposit_message) ||
    normalizeText(order.payment_message) ||
    ""
  );
}

function resolveConfirmationStatus(order = {}) {
  return (
    normalizeText(order.deposit_customer_confirmation_status) ||
    normalizeText(order.deposit?.customer_confirmation_status)
  );
}

function PrimaryButton({ children, disabled = false, onClick, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: "999px",
        background: disabled ? "#94a3b8" : "#0f766e",
        color: "#ffffff",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 900,
        minHeight: "46px",
        padding: "12px 18px",
        boxShadow: disabled ? "none" : "0 14px 26px rgba(15, 118, 110, 0.18)",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryLink({ children, href, to }) {
  const sharedStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "46px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 800,
    padding: "11px 16px",
    textDecoration: "none",
  };

  if (to) {
    return (
      <Link to={to} style={sharedStyle}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} style={sharedStyle}>
      {children}
    </a>
  );
}

export default function CustomerPortalDeposit() {
  const { orderNumber } = useParams();
  const { customerSession } = useOutletContext() || {};
  const portalData = useCustomerPortalData(customerSession);
  const decodedOrderNumber = decodeURIComponent(orderNumber || "");
  const scopedRecord = useMemo(
    () =>
      portalData.allOrders.find(
        (record) => String(record.order_number || "") === decodedOrderNumber
      ) || null,
    [decodedOrderNumber, portalData.allOrders]
  );
  const [localRecord, setLocalRecord] = useState(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const record = localRecord || scopedRecord;

  if (!record) {
    return (
      <PortalPage
        eyebrow="Deposit"
        title="Deposit Payment"
        description="We could not find that order in your portal account."
      >
        <EmptyState
          title="Order not available"
          description="Open the order from your portal dashboard or contact Tee & Co if you need help."
          actionLabel="Back to My Orders"
          actionTo="/portal/orders"
        />
      </PortalPage>
    );
  }

  const providerConfig = getDepositPaymentProviderConfig(record);
  const depositAmount = resolveDepositAmount(record);
  const hasDepositAmount = depositAmount > 0;
  const remainingBalance = resolveRemainingBalanceAfterDeposit(record);
  const depositStatus = resolveDepositStatus(record);
  const depositMessage = resolveDepositMessage(record);
  const confirmationStatus = resolveConfirmationStatus(record);
  const hasCustomerConfirmation = confirmationStatus.toLowerCase() === "sent" || submitted;
  const contactHref = buildDepositContactHref(record, providerConfig);
  const actionStillRequired = isDepositActionRequired(record);

  function handleConfirmPaymentSent() {
    setSubmitError("");

    if (!hasDepositAmount) {
      setSubmitError("Deposit amount is pending from Tee & Co.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const note = normalizeText(paymentNote);
      const updatedOrder = updateStoredOrder(record.order_number, {
        deposit_customer_confirmation_status: "Sent",
        deposit_customer_confirmed_at: now,
        deposit_customer_confirmation_note: note,
        deposit: {
          ...(record.deposit || {}),
          amount: depositAmount || record.deposit?.amount || 0,
          status: record.deposit?.status || "pending",
          customer_confirmation_status: "sent",
          customer_marked_sent_at: now,
          customer_confirmation_note: note,
        },
        activity_type: "deposit_customer_confirmation",
        activity_note: note
          ? `Customer marked deposit payment as sent. Note: ${note}`
          : "Customer marked deposit payment as sent.",
      });

      setLocalRecord(updatedOrder);
      setSubmitted(true);
      setPaymentNote("");
    } catch (error) {
      setSubmitError(error?.message || "Unable to record payment confirmation.");
    }
  }

  return (
    <PortalPage
      eyebrow="Action Needed"
      title="Pay Deposit"
      description="Review the deposit details for your order request and let Tee & Co know when payment has been sent."
    >
      <SectionCard
        title={`Order ${record.order_number}`}
        subtitle="Deposit details"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <DetailPair label="Order Number" value={record.order_number} />
          <DetailPair
            label="Deposit Amount"
            value={hasDepositAmount ? formatCurrency(depositAmount) : "Deposit amount pending from Tee & Co."}
          />
          <DetailPair label="Deposit Status" value={depositStatus} />
          <DetailPair
            label="Remaining Balance"
            value={hasDepositAmount ? formatCurrency(remainingBalance) : "Pending"}
          />
          <DetailPair
            label="Last Updated"
            value={record.updated_at ? formatShortDate(record.updated_at) : "Recently"}
          />
          <DetailPair
            label="Payment Method"
            value={providerConfig.provider === "manual" ? "Manual arrangement" : providerConfig.provider}
          />
        </div>

        {depositMessage ? (
          <div
            style={{
              borderRadius: "18px",
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1e3a8a",
              padding: "14px 16px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {depositMessage}
          </div>
        ) : null}

        {!hasDepositAmount ? (
          <div
            data-testid="deposit-amount-pending"
            style={{
              borderRadius: "18px",
              border: "1px solid #fed7aa",
              background: "#fff7ed",
              color: "#9a3412",
              padding: "14px 16px",
              lineHeight: 1.6,
              fontWeight: 800,
            }}
          >
            Deposit amount pending from Tee & Co.
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Payment Instructions"
        subtitle={
          providerConfig.provider === "manual"
            ? "Tee & Co will confirm the payment before the deposit is marked received."
            : "Online payment processing will connect here when the provider is enabled."
        }
      >
        {providerConfig.provider === "manual" ? (
          <div style={{ display: "grid", gap: "14px" }}>
            <div
              data-testid="manual-deposit-instructions"
              style={{
                borderRadius: "18px",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#78350f",
                padding: "16px",
                display: "grid",
                gap: "8px",
              }}
            >
              <strong>Contact Tee & Co to arrange deposit payment.</strong>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                {providerConfig.manualInstructions}
              </p>
              {providerConfig.eTransferInstructions ? (
                <p style={{ margin: 0, lineHeight: 1.6 }}>
                  E-transfer: {providerConfig.eTransferInstructions}
                </p>
              ) : null}
              {providerConfig.contactPhone ? (
                <p style={{ margin: 0, lineHeight: 1.6 }}>
                  Phone: {providerConfig.contactPhone}
                </p>
              ) : null}
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                Email: {providerConfig.contactEmail}
              </p>
            </div>

            <label style={{ display: "grid", gap: "8px", color: "#0f172a", fontWeight: 800 }}>
              Payment notes
              <textarea
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                rows={4}
                placeholder="Optional note, confirmation number, or payment reference"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: "16px",
                  border: "1px solid #cbd5e1",
                  padding: "12px 14px",
                  font: "inherit",
                  resize: "vertical",
                }}
              />
            </label>

            {hasCustomerConfirmation ? (
              <div
                data-testid="deposit-confirmation-success"
                style={{
                  borderRadius: "18px",
                  border: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                  color: "#166534",
                  padding: "14px 16px",
                  fontWeight: 800,
                }}
              >
                Payment sent confirmation recorded. Tee & Co will verify the deposit.
              </div>
            ) : null}

            {submitError ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "14px 16px",
                  fontWeight: 800,
                }}
              >
                {submitError}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <PrimaryButton
                onClick={handleConfirmPaymentSent}
                disabled={!actionStillRequired || hasCustomerConfirmation || !hasDepositAmount}
              >
                I've Sent Payment
              </PrimaryButton>
              <SecondaryLink href={contactHref}>Contact Tee & Co</SecondaryLink>
              <SecondaryLink to="/portal/orders">Back to My Orders</SecondaryLink>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            <div
              style={{
                borderRadius: "18px",
                border: "1px solid #dbe4ee",
                background: "#f8fafc",
                color: "#334155",
                padding: "16px",
                lineHeight: 1.6,
                fontWeight: 700,
              }}
            >
              {providerConfig.provider} payment processing is configured as the provider placeholder.
              No live payment gateway is connected in this phase.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <SecondaryLink href={contactHref}>Contact Tee & Co</SecondaryLink>
              <SecondaryLink to="/portal/orders">Back to My Orders</SecondaryLink>
            </div>
          </div>
        )}
      </SectionCard>
    </PortalPage>
  );
}
