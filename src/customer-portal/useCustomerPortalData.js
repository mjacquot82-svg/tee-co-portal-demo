import { useMemo, useRef } from "react";
import {
  EMPTY_PORTAL_SUMMARY,
  buildCustomerPortalSummary,
  getCustomerActiveOrders,
  getCustomerArchivedOrders,
  findCustomerProfileForSession,
  getCustomerInvoices,
  getCustomerQuotes,
  getCustomerRequests,
  getCustomerScopedOrders,
} from "../lib/customerPortalData";
import { useStoredCustomers } from "../lib/customersStore";
import { useOrders } from "../repositories/ordersRepository";

const EMPTY_PORTAL_DATA = Object.freeze({
  profile: null,
  orders: Object.freeze([]),
  activeOrders: Object.freeze([]),
  archivedOrders: Object.freeze([]),
  allOrders: Object.freeze([]),
  requests: Object.freeze([]),
  quotes: Object.freeze([]),
  invoices: Object.freeze([]),
  summary: EMPTY_PORTAL_SUMMARY,
});

export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function useCustomerPortalData(session) {
  const orders = useOrders();
  const customers = useStoredCustomers();
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
    const requests = getCustomerRequests(scopedOrders);
    const activeOrders = getCustomerActiveOrders(scopedOrders);
    const archivedOrders = getCustomerArchivedOrders(scopedOrders);
    const quotes = getCustomerQuotes(scopedOrders);
    const invoices = getCustomerInvoices(scopedOrders);
    const summary = buildCustomerPortalSummary(activeOrders);

    console.debug("[portal] useCustomerPortalData render", {
      renderCount: renderCountRef.current,
      sessionId: session.id || "",
      customerCount: customers.length,
      orderCount: orders.length,
      scopedOrderCount: scopedOrders.length,
      requestCount: requests.length,
      activeOrderCount: activeOrders.length,
      archivedOrderCount: archivedOrders.length,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
      summary,
      profileId: profile?.id || "",
    });

    return {
      profile,
      orders: activeOrders,
      activeOrders,
      archivedOrders,
      allOrders: scopedOrders,
      requests,
      quotes,
      invoices,
      summary,
    };
  }, [customers, orders, session]);
}
