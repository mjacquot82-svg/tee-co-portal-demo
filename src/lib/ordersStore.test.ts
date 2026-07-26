import { afterEach, describe, expect, test, vi } from "vitest";

import {
  configureOrdersPersistenceForTests,
  ensureOrdersHydrated,
  getStoredOrders,
} from "./ordersStore";
import { getCustomerScopedOrders } from "./customerPortalData";
import { isActiveQuoteWorkflowOrder } from "../quotes/quoteWorkflow";
import { PERSISTENCE_MODES } from "./persistenceMode";

describe("orders browser cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configureOrdersPersistenceForTests();
  });

  test("keeps fresh Supabase orders visible in customer and admin views when localStorage is over quota", async () => {
    const staleOrders = JSON.stringify([
      {
        order_number: "TC-STALE",
        customer_name: "Stale Customer",
        customer_email: "stale@example.com",
        customer_phone: "555-0100",
      },
    ]);
    const storage = {
      getItem: vi.fn(() => staleOrders),
      setItem: vi.fn(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: storage,
      sessionStorage: storage,
    });

    const freshOrder = {
      id: "remote-838236",
      order_number: "TC-838236",
      customer_id: "customer-838236",
      customer_name: "Marc Jacquot",
      customer_email: "marc@example.com",
      customer_phone: "519-8851-6869",
      source: "Customer Portal",
      request_type: "Order Request",
      status: "New",
      quote_status: "Draft",
      operational_visible: false,
      created_at: "2026-07-26T01:03:58.236Z",
      updated_at: "2026-07-26T01:03:58.236Z",
    };
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [freshOrder], error: null })),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });

    await ensureOrdersHydrated({ force: true });

    const visibleOrders = getStoredOrders();
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.getItem()).toBe(staleOrders);
    expect(visibleOrders.map((order) => order.order_number)).toEqual(["TC-838236"]);

    const myOrders = getCustomerScopedOrders({
      session: {
        id: "customer-838236",
        email: "marc@example.com",
      },
      orders: visibleOrders,
      customers: [],
    });
    expect(myOrders.map((order) => order.order_number)).toEqual(["TC-838236"]);

    const adminOrderRequests = visibleOrders.filter(isActiveQuoteWorkflowOrder);
    expect(adminOrderRequests.map((order) => order.order_number)).toEqual(["TC-838236"]);
  });
});
