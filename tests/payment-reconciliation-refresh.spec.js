// @ts-check
import { expect, test } from "@playwright/test";
import { startPaymentReconciliationRefresh } from "../src/lib/usePaymentReconciliationRefresh.js";

function createEventTarget(initialVisibility = "visible") {
  const listeners = new Map();
  return {
    visibilityState: initialVisibility,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    has(type) {
      return listeners.has(type);
    },
  };
}

test("open customer and admin sessions revalidate payment reconciliation data", async () => {
  const calls = [];
  const windowTarget = createEventTarget();
  const documentTarget = createEventTarget();
  let intervalCallback = null;
  let clearedInterval = null;

  const stop = startPaymentReconciliationRefresh({
    refreshPayments: async () => calls.push("payments"),
    refreshOrders: async () => calls.push("orders"),
    windowTarget,
    documentTarget,
    setIntervalFn(callback, intervalMs) {
      intervalCallback = callback;
      expect(intervalMs).toBe(5000);
      return "refresh-interval";
    },
    clearIntervalFn(intervalId) {
      clearedInterval = intervalId;
    },
  });

  await expect.poll(() => calls).toEqual(["payments", "orders"]);
  intervalCallback?.();
  await expect.poll(() => calls).toEqual(["payments", "orders", "payments", "orders"]);
  windowTarget.dispatch("focus");
  await expect.poll(() => calls).toEqual([
    "payments",
    "orders",
    "payments",
    "orders",
    "payments",
    "orders",
  ]);

  stop();
  expect(clearedInterval).toBe("refresh-interval");
  expect(windowTarget.has("focus")).toBe(false);
  expect(documentTarget.has("visibilitychange")).toBe(false);
});
