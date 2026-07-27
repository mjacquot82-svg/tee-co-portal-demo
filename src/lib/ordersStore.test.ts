import { afterEach, describe, expect, test, vi } from "vitest";

import {
  configureOrdersPersistenceForTests,
  ensureOrdersHydrated,
  getStoredOrders,
  mergeOrdersByFreshness,
  saveStoredOrders,
  updateStoredOrder,
} from "./ordersStore";
import { getCustomerScopedOrders } from "./customerPortalData";
import { isActiveQuoteWorkflowOrder } from "../quotes/quoteWorkflow";
import { PERSISTENCE_MODES } from "./persistenceMode";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installMemoryStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  vi.stubGlobal("window", {
    localStorage: storage,
    sessionStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  return storage;
}

function orderSnapshot(overrides = {}) {
  return {
    id: "order-race-1",
    order_number: "TC-RACE-1",
    customer_id: "customer-race-1",
    customer_name: "Race Customer",
    customer_email: "race@example.com",
    customer_phone: "+15198816869",
    request_type: "Order Request",
    status: "New",
    quote_status: "Draft",
    operational_visible: false,
    artwork_approval_required: true,
    artwork_approval_status: "Pending Review",
    artwork_status: "Uploaded",
    deposit_required: null,
    deposit_requirement: "undecided",
    deposit_requirement_status: "Undecided",
    deposit_workflow_status: "Pending",
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

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

  test("keeps the newer published order when hydration returns an older record", () => {
    const current = orderSnapshot({
      artwork_approval_status: "Approved",
      updated_at: "2026-07-27T00:00:02.000Z",
    });
    const staleHydration = orderSnapshot({
      artwork_approval_status: "Pending Review",
      updated_at: "2026-07-27T00:00:01.000Z",
    });

    const [merged] = mergeOrdersByFreshness([current], [staleHydration]);

    expect(merged.artwork_approval_status).toBe("Approved");
    expect(merged.updated_at).toBe("2026-07-27T00:00:02.000Z");
  });

  test("accepts legitimate remote data that is newer than the published order", () => {
    const current = orderSnapshot({
      deposit_requirement_status: "Undecided",
      updated_at: "2026-07-27T00:00:01.000Z",
    });
    const newerRemote = orderSnapshot({
      deposit_required: false,
      deposit_requirement: "not_required",
      deposit_requirement_status: "Not Required",
      deposit_workflow_status: "Deposit Not Required",
      updated_at: "2026-07-27T00:00:02.000Z",
    });

    const [merged] = mergeOrdersByFreshness([current], [newerRemote]);

    expect(merged.deposit_requirement_status).toBe("Not Required");
    expect(merged.updated_at).toBe("2026-07-27T00:00:02.000Z");
  });

  test("does not let hydration that began before a successful write regress workflow state", async () => {
    installMemoryStorage();
    const hydrationResult = createDeferred<{ data: unknown[]; error: null }>();
    let persistedPayload: Record<string, unknown> | null = null;

    const supabaseClient = {
      from: vi.fn(() => {
        let operation = "list";
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => hydrationResult.promise),
          update: vi.fn((payload) => {
            operation = "update";
            persistedPayload = payload;
            return query;
          }),
          eq: vi.fn(() => query),
          single: vi.fn(() =>
            Promise.resolve({
              data: operation === "update" ? persistedPayload : null,
              error: null,
            })
          ),
        };
        return query;
      }),
    };
    configureOrdersPersistenceForTests({
      supabaseClient,
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    saveStoredOrders([orderSnapshot()]);

    const hydration = ensureOrdersHydrated({ force: true });
    await updateStoredOrder("TC-RACE-1", {
      deposit_required: false,
      deposit_requirement: "not_required",
      deposit_requirement_status: "Not Required",
      deposit_workflow_status: "Deposit Not Required",
    });
    expect(getStoredOrders()[0].deposit_requirement_status).toBe("Not Required");

    hydrationResult.resolve({
      data: [orderSnapshot()],
      error: null,
    });
    await hydration;

    expect(getStoredOrders()[0].deposit_requirement_status).toBe("Not Required");
    expect(getStoredOrders()[0].deposit_workflow_status).toBe("Deposit Not Required");
  });

  test("serializes simultaneous workflow updates so later updates build on the latest order", async () => {
    installMemoryStorage();
    const persistedPayloads: Record<string, unknown>[] = [];
    const supabaseClient = {
      from: vi.fn(() => {
        let payload: Record<string, unknown> | null = null;
        const query = {
          update: vi.fn((nextPayload) => {
            payload = nextPayload;
            persistedPayloads.push(nextPayload);
            return query;
          }),
          eq: vi.fn(() => query),
          select: vi.fn(() => query),
          single: vi.fn(() => Promise.resolve({ data: payload, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return query;
      }),
    };
    configureOrdersPersistenceForTests({
      supabaseClient,
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    saveStoredOrders([orderSnapshot()]);

    const artworkUpdate = updateStoredOrder("TC-RACE-1", {
      artwork_approval_status: "Approved",
      artwork_status: "Approved",
    });
    const depositUpdate = updateStoredOrder("TC-RACE-1", {
      deposit_required: false,
      deposit_requirement: "not_required",
      deposit_requirement_status: "Not Required",
      deposit_workflow_status: "Deposit Not Required",
    });
    await Promise.all([artworkUpdate, depositUpdate]);

    const finalOrder = getStoredOrders()[0];
    expect(finalOrder.artwork_approval_status).toBe("Approved");
    expect(finalOrder.deposit_requirement_status).toBe("Not Required");
    expect(persistedPayloads).toHaveLength(2);
    expect(persistedPayloads[1].artwork_approval_status).toBe("Approved");
  });
});
