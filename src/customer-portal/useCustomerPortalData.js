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
import { useStoredCustomers } from "../lib/customersStore";
import { useStoredOrders } from "../lib/ordersStore";

const EMPTY_PORTAL_DATA = Object.freeze({
  profile: null,
  orders: Object.freeze([]),
  activeOrders: Object.freeze([]),
  archivedOrders: Object.freeze([]),
  allOrders: Object.freeze([]),
  quotes: Object.freeze([]),
  invoices: Object.freeze([]),
  summary: EMPTY_PORTAL_SUMMARY,
});

export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function useCustomerPortalData(session) {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();

  return useMemo(() => {
    if (!session) {
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

    return {
      profile,
      orders: activeOrders,
      activeOrders,
      archivedOrders,
      allOrders: scopedOrders,
      quotes,
      invoices,
      summary,
    };
  }, [customers, orders, session]);
}
