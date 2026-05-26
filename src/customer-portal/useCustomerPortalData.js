import { useMemo } from "react";
import {
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

export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function useCustomerPortalData(session) {
  const orders = useStoredOrders();
  const customers = useStoredCustomers();

  return useMemo(() => {
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
