import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getActiveCustomerSession,
  subscribeToActiveCustomerSession,
} from "./customerSessionStore";
import { getCustomerScopedOrders } from "./customerPortalData";
import { useStoredCustomers } from "./customersStore";
import { useOrders } from "../repositories/ordersRepository";

function subscribeToCustomerSessionSnapshot(listener) {
  return subscribeToActiveCustomerSession(() => {
    listener();
  });
}

function getAnonymousCustomerSession() {
  return null;
}

function buildRedirectTarget(location) {
  return `${location.pathname}${location.search || ""}`;
}

export function findCustomerOwnedOrder({
  session,
  orders = [],
  customers = [],
  orderNumber = "",
} = {}) {
  const normalizedOrderNumber = String(orderNumber || "").trim();
  if (!session || !normalizedOrderNumber) return null;

  const scopedOrders = getCustomerScopedOrders({
    session,
    orders,
    customers,
  });

  return (
    scopedOrders.find((order) => order.order_number === normalizedOrderNumber) || null
  );
}

export function useCustomerWorkflowOrderAccess({
  orderNumber = "",
  workflowLabel = "customer workflow",
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSyncExternalStore(
    subscribeToCustomerSessionSnapshot,
    getActiveCustomerSession,
    getAnonymousCustomerSession
  );
  const orders = useOrders();
  const customers = useStoredCustomers();
  const normalizedOrderNumber = String(orderNumber || "").trim();

  useEffect(() => {
    if (session) return;

    navigate(
      `/login?redirectTo=${encodeURIComponent(buildRedirectTarget(location))}`,
      { replace: true }
    );
  }, [location, navigate, session]);

  const ownedOrder = useMemo(
    () =>
      findCustomerOwnedOrder({
        session,
        orders,
        customers,
        orderNumber: normalizedOrderNumber,
      }),
    [customers, normalizedOrderNumber, orders, session]
  );

  const targetOrderExists = useMemo(
    () => orders.some((order) => order.order_number === normalizedOrderNumber),
    [normalizedOrderNumber, orders]
  );
  const accessDenied = Boolean(session && normalizedOrderNumber && !ownedOrder);

  useEffect(() => {
    if (!accessDenied) return;

    console.warn("[customerWorkflowAccess] ownership validation failed", {
      workflowLabel,
      orderNumber: normalizedOrderNumber,
      hasTargetOrder: targetOrderExists,
      customerSessionId: session?.id || "",
      customerEmail: session?.email || "",
    });
  }, [accessDenied, normalizedOrderNumber, session, targetOrderExists, workflowLabel]);

  return {
    session,
    order: ownedOrder,
    isRedirectingToLogin: !session,
    accessDenied,
    orderNumber: normalizedOrderNumber,
  };
}
