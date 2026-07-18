import { useEffect } from "react";
import { ensureOrdersHydrated } from "./ordersStore";
import { refreshPaymentsFromSupabase } from "./paymentsStore";

const DEFAULT_REFRESH_INTERVAL_MS = 5000;

export function startPaymentReconciliationRefresh({
  refreshPayments = refreshPaymentsFromSupabase,
  refreshOrders = () => ensureOrdersHydrated({ force: true }),
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  windowTarget = typeof window !== "undefined" ? window : null,
  documentTarget = typeof document !== "undefined" ? document : null,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let active = true;
  let refreshInProgress = false;

  const refresh = async () => {
    if (!active || refreshInProgress) return;
    refreshInProgress = true;
    try {
      await Promise.allSettled([refreshPayments(), refreshOrders()]);
    } finally {
      refreshInProgress = false;
    }
  };

  const handleFocus = () => {
    void refresh();
  };
  const handleVisibilityChange = () => {
    if (!documentTarget || documentTarget.visibilityState === "visible") {
      void refresh();
    }
  };

  void refresh();
  const intervalId = setIntervalFn(() => void refresh(), intervalMs);
  windowTarget?.addEventListener?.("focus", handleFocus);
  documentTarget?.addEventListener?.("visibilitychange", handleVisibilityChange);

  return () => {
    active = false;
    clearIntervalFn(intervalId);
    windowTarget?.removeEventListener?.("focus", handleFocus);
    documentTarget?.removeEventListener?.("visibilitychange", handleVisibilityChange);
  };
}

export function usePaymentReconciliationRefresh(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    return startPaymentReconciliationRefresh();
  }, [enabled]);
}
