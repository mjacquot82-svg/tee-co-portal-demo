import { useEffect, useMemo, useRef } from "react";
import { useStoredOrders } from "./ordersStore";
import {
  listPaymentRequests,
  listPayments,
  usePaymentsSnapshot,
} from "./paymentsStore";
import { synchronizeStoredOrderPaymentRollups } from "../services/orderPaymentRollupSynchronization";

function normalizeSignatureValue(value) {
  return String(value ?? "").trim();
}

export function buildPaymentRollupSynchronizationSignature({
  orders = [],
  paymentRequests = [],
  payments = [],
} = {}) {
  const orderNumbers = orders
    .map((order) => normalizeSignatureValue(order.order_number))
    .filter(Boolean)
    .sort();
  const requestFacts = paymentRequests
    .map((request) => [
      request.id,
      request.order_number,
      request.request_type,
      request.amount_requested,
      request.status,
    ].map(normalizeSignatureValue).join(":"))
    .sort();
  const paymentFacts = payments
    .map((payment) => [
      payment.id,
      payment.order_number,
      payment.payment_type,
      payment.request_type,
      payment.amount,
      payment.status,
      payment.provider_status,
    ].map(normalizeSignatureValue).join(":"))
    .sort();

  return JSON.stringify([orderNumbers, requestFacts, paymentFacts]);
}

export function useAdminPaymentRollupSynchronization(enabled) {
  const orders = useStoredOrders();
  const paymentsSnapshot = usePaymentsSnapshot();
  const paymentRequests = paymentsSnapshot.paymentRequests.length
    ? paymentsSnapshot.paymentRequests
    : listPaymentRequests();
  const payments = paymentsSnapshot.payments.length
    ? paymentsSnapshot.payments
    : listPayments();
  const lastSynchronizationSignatureRef = useRef("");
  const signature = useMemo(
    () =>
      buildPaymentRollupSynchronizationSignature({
        orders,
        paymentRequests,
        payments,
      }),
    [orders, paymentRequests, payments]
  );

  useEffect(() => {
    if (
      !enabled ||
      !orders.length ||
      (!paymentRequests.length && !payments.length) ||
      lastSynchronizationSignatureRef.current === signature
    ) {
      return;
    }

    lastSynchronizationSignatureRef.current = signature;
    void synchronizeStoredOrderPaymentRollups({
      orders,
      paymentRequests,
      payments,
    }).catch((error) => {
      lastSynchronizationSignatureRef.current = "";
      console.error("[PaymentRollupSynchronization] Failed to synchronize order payment rollups", error);
    });
  }, [enabled, orders, paymentRequests, payments, signature]);
}

export function AdminPaymentRollupSynchronization() {
  useAdminPaymentRollupSynchronization(true);
  return null;
}
