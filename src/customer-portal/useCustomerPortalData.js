import { useMemo, useRef } from "react";
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
import { useStoredCustomers } from "../lib/customersStore";
import { useStoredOrders } from "../lib/ordersStore";
import {
  useStoredPaymentEvents,
  useStoredPaymentRequests,
  useStoredPayments,
} from "../lib/paymentsStore";
import {
  buildPortalPaymentSummary,
  filterCustomerPaymentRecords,
} from "./paymentPresentation";

const EMPTY_PORTAL_DATA = Object.freeze({
  profile: null,
  orders: Object.freeze([]),
  activeOrders: Object.freeze([]),
  archivedOrders: Object.freeze([]),
  allOrders: Object.freeze([]),
  quotes: Object.freeze([]),
  invoices: Object.freeze([]),
  paymentRequests: Object.freeze([]),
  payments: Object.freeze([]),
  paymentEvents: Object.freeze([]),
  paymentsSummary: Object.freeze({
    openRequestCount: 0,
    amountOwing: 0,
    totalPaid: 0,
    overallStatus: "No Outstanding Balance",
  }),
  summary: EMPTY_PORTAL_SUMMARY,
});

export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function useCustomerPortalData(session) {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  const paymentRequests = useStoredPaymentRequests();
  const payments = useStoredPayments();
  const paymentEvents = useStoredPaymentEvents();
  const renderCountRef = useRef(0);

  return useMemo(() => {
    renderCountRef.current += 1;

    if (!session) {
      console.debug("[portal] useCustomerPortalData render", {
        renderCount: renderCountRef.current,
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
    const customerIds = [profile?.id, profile?.customer_id];
    const orderNumbers = scopedOrders.map((order) => order.order_number);
    const scopedPaymentRequests = filterCustomerPaymentRecords(paymentRequests, {
      customerIds,
      orderNumbers,
    });
    const scopedPayments = filterCustomerPaymentRecords(payments, {
      customerIds,
      orderNumbers,
    });
    const scopedPaymentEvents = filterCustomerPaymentRecords(paymentEvents, {
      customerIds,
      orderNumbers,
    });
    const paymentsSummary = buildPortalPaymentSummary(scopedPaymentRequests, scopedPayments);
    const ordersWithPayments = scopedOrders.map((order) => ({
      ...order,
      portal_payment_requests: scopedPaymentRequests.filter(
        (paymentRequest) => paymentRequest.order_number === order.order_number
      ),
      portal_payments: scopedPayments.filter((payment) => payment.order_number === order.order_number),
      portal_payment_events: scopedPaymentEvents.filter(
        (event) => event.order_number === order.order_number
      ),
    }));
    const activeOrders = getCustomerActiveOrders(ordersWithPayments);
    const archivedOrders = getCustomerArchivedOrders(ordersWithPayments);
    const quotes = getCustomerQuotes(ordersWithPayments);
    const invoices = getCustomerInvoices(ordersWithPayments);
    const summary = buildCustomerPortalSummary(activeOrders);

    console.debug("[portal] useCustomerPortalData render", {
      renderCount: renderCountRef.current,
      sessionId: session.id || "",
      customerCount: customers.length,
      orderCount: orders.length,
      scopedOrderCount: scopedOrders.length,
      activeOrderCount: activeOrders.length,
      archivedOrderCount: archivedOrders.length,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
      paymentRequestCount: scopedPaymentRequests.length,
      paymentCount: scopedPayments.length,
      summary,
      paymentsSummary,
      profileId: profile?.id || "",
    });

    return {
      profile,
      orders: activeOrders,
      activeOrders,
      archivedOrders,
      allOrders: ordersWithPayments,
      quotes,
      invoices,
      paymentRequests: scopedPaymentRequests,
      payments: scopedPayments,
      paymentEvents: scopedPaymentEvents,
      paymentsSummary,
      summary,
    };
  }, [customers, orders, paymentEvents, paymentRequests, payments, session]);
}
