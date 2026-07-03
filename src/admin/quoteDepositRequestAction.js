import { updateStoredOrder } from "../lib/ordersStore";
import {
  buildDepositRequestContent,
  createAndSendDepositPaymentRequestForOrder,
} from "../orders/depositRequests";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function requestQuoteDeposit({
  order = {},
  requestDetails = {},
  activeStaffUser = null,
  updateOrder = updateStoredOrder,
  createAndSendPaymentRequest = createAndSendDepositPaymentRequestForOrder,
} = {}) {
  const depositAmount = roundCurrency(requestDetails.amount);
  if (depositAmount <= 0) return null;

  const now = new Date().toISOString();
  const depositType = requestDetails.type === "fixed" ? "fixed" : "percentage";
  const depositPercentage =
    depositType === "percentage" ? Number(requestDetails.percentage || 0) : null;
  const fallbackMessage = `Please send your deposit by e-transfer to orders@teeandco.ca and include your order number ${order.order_number}.`;
  const depositMessage = String(requestDetails.message || "").trim() || fallbackMessage;
  const paymentOrder = {
    ...order,
    deposit_amount: depositAmount,
    deposit: {
      ...(order.deposit || {}),
      amount: depositAmount,
      type: depositType,
      percentage: depositPercentage,
    },
  };

  const result = await createAndSendPaymentRequest(
    paymentOrder,
    {
      ...requestDetails,
      body: depositMessage,
    },
    {
      staffUserId: activeStaffUser?.id || "",
    }
  );
  const checkoutUrl =
    result?.paymentRequest?.provider_checkout_url ||
    result?.providerLink?.provider_checkout_url ||
    "";
  const depositRequestContent = buildDepositRequestContent(paymentOrder, { checkoutUrl });
  const customerMessage = depositRequestContent.body || depositMessage;

  const updatedOrder = await updateOrder(order.order_number, {
    request_status: "Awaiting Deposit",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_requirement_status: "Required",
    deposit_workflow_status: "Deposit Requested",
    deposit_amount: depositAmount,
    deposit_payment_instructions: customerMessage,
    deposit_request_message: customerMessage,
    deposit: {
      ...(order.deposit || {}),
      amount: depositAmount,
      type: depositType,
      percentage: depositPercentage,
      status: "pending",
      requested_at: now,
      updated_at: now,
      last_requested_message: customerMessage,
      payment_request_id: result?.paymentRequest?.id || "",
      provider_checkout_url: checkoutUrl,
    },
    quote_status: "Awaiting Deposit",
    activity_type: "deposit_request",
    activity_note: `Deposit of ${money(depositAmount)} required by ${activeStaffUser?.name || "staff"}.`,
  });

  return {
    ...result,
    checkoutUrl,
    depositRequestContent,
    updatedOrder,
  };
}
