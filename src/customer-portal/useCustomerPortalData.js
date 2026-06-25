import { useMemo } from "react";
import {
  EMPTY_PORTAL_SUMMARY,
  buildCustomerPortalSummary,
  getCustomerActiveOrders,
  getCustomerArchivedOrders,
  findCustomerProfileForSession,
  getCustomerInvoices,
  getCustomerQuotes,
  getCustomerScopedOrders,
} from "../lib/customerPortalData";
import { usePaymentsSnapshot } from "../lib/paymentsStore";
import { useStoredCustomers } from "../lib/customersStore";
import { useStoredOrders } from "../lib/ordersStore";
import { getCustomerPortalPaymentData } from "./customerPortalPayments";

const EMPTY_PORTAL_DATA = Object.freeze({
  profile: null,
  orders: Object.freeze([]),
  activeOrders: Object.freeze([]),
  archivedOrders: Object.freeze([]),
  allOrders: Object.freeze([]),
  quotes: Object.freeze([]),
  invoices: Object.freeze([]),
  paymentRequests: Object.freeze([]),
  openPaymentRequests: Object.freeze([]),
  payments: Object.freeze([]),
  paymentEvents: Object.freeze([]),
  paymentSummary: Object.freeze({
    amountOwing: 0,
    totalPaid: 0,
    paymentStatus: "No Balance Due",
  }),
  summary: EMPTY_PORTAL_SUMMARY,
});

export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function useCustomerPortalData(session) {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  const paymentsSnapshot = usePaymentsSnapshot();

  return useMemo(() => {
    if (!session) {
      console.debug("[portal] useCustomerPortalData render", {
        hasSession: false,
      });
      return EMPTY_PORTAL_DATA;
    }

    const profile = findCustomerProfileForSession(session, customers);
    const scopedOrders = getCustomerScopedOrders({
      session,
      orders,
      customers,
    });
    const activeOrders = getCustomerActiveOrders(scopedOrders);
    const archivedOrders = getCustomerArchivedOrders(scopedOrders);
    const quotes = getCustomerQuotes(scopedOrders);
    const invoices = getCustomerInvoices(scopedOrders);
    const summary = buildCustomerPortalSummary(activeOrders);
    const customerIds = Array.from(
      new Set(
        [
          profile?.id,
          profile?.customer_id,
          ...scopedOrders.map((order) => order.customer_id),
        ].filter(Boolean)
      )
    );
    const portalPayments = getCustomerPortalPaymentData({
      orders: scopedOrders,
      customerIds,
      paymentRequests: paymentsSnapshot.paymentRequests,
      payments: paymentsSnapshot.payments,
      paymentEvents: paymentsSnapshot.paymentEvents,
    });
    console.debug("[portal] useCustomerPortalData render", {
      sessionId: session.id || "",
      customerCount: customers.length,
      orderCount: orders.length,
      scopedOrderCount: scopedOrders.length,
      activeOrderCount: activeOrders.length,
      archivedOrderCount: archivedOrders.length,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
      paymentRequestCount: portalPayments.paymentRequests.length,
      paymentCount: portalPayments.payments.length,
      summary,
      profileId: profile?.id || "",
    });

    return {
      profile,
      orders: activeOrders,
      activeOrders,
      archivedOrders,
      allOrders: scopedOrders,
      quotes,
      invoices,
      paymentRequests: portalPayments.paymentRequests,
      openPaymentRequests: portalPayments.openPaymentRequests,
      payments: portalPayments.payments,
      paymentEvents: portalPayments.paymentEvents,
      paymentSummary: {
        amountOwing: portalPayments.amountOwing,
        totalPaid: portalPayments.totalPaid,
        paymentStatus: portalPayments.paymentStatus,
      },
      summary,
    };
  }, [customers, orders, paymentsSnapshot, session]);
}
