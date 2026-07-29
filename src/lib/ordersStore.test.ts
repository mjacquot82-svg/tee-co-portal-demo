import { afterEach, describe, expect, test, vi } from "vitest";

import {
  configureOrdersPersistenceForTests,
  ensureOrdersHydrated,
  getOrdersHydrationState,
  getStoredOrders,
  saveStoredOrders,
  subscribeToStoredOrders,
  updateStoredOrder,
} from "./ordersStore";
import { getCustomerScopedOrders } from "./customerPortalData";
import { isActiveQuoteWorkflowOrder } from "../quotes/quoteWorkflow";
import { PERSISTENCE_MODES } from "./persistenceMode";
import {
  getPendingCustomerRequest,
  savePendingCustomerRequest,
} from "./pendingCustomerRequestStore";
import {
  listNotificationActivity,
  resetNotificationActivityForTests,
} from "./notificationDeliveryService";

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
  const listeners = new Map<string, Set<(event: { key: string | null }) => void>>();
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
    location: { origin: "https://production.example.test" },
    addEventListener: vi.fn((type: string, listener: (event: { key: string | null }) => void) => {
      const typeListeners = listeners.get(type) || new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: { key: string | null }) => void) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  });
  return {
    storage,
    values,
    dispatchStorage(key: string | null) {
      listeners.get("storage")?.forEach((listener) => listener({ key }));
    },
  };
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

    await ensureOrdersHydrated();

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

  test("replaces cached approval state even when its client timestamp is later", async () => {
    installMemoryStorage();
    const cached = orderSnapshot({
      artwork_approval_status: "Approved",
      updated_at: "2026-07-27T00:00:02.000Z",
    });
    const remote = orderSnapshot({
      artwork_approval_status: "Pending Review",
      updated_at: "2026-07-27T00:00:01.000Z",
    });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [remote], error: null })),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    saveStoredOrders([cached]);

    expect(getStoredOrders()[0].artwork_approval_status).toBe("Approved");
    expect(getOrdersHydrationState()).toMatchObject({ source: "cache" });

    await ensureOrdersHydrated({ force: true });

    expect(getStoredOrders()[0].artwork_approval_status).toBe("Pending Review");
    expect(getStoredOrders()[0].updated_at).toBe("2026-07-27T00:00:01.000Z");
    expect(getOrdersHydrationState()).toMatchObject({
      status: "ready",
      source: "server",
    });
  });

  test("adds server-only orders and removes cached-only submitted orders", async () => {
    installMemoryStorage();
    const cachedOnly = orderSnapshot({
      id: "cached-only",
      order_number: "TC-CACHED-ONLY",
    });
    const serverOnly = orderSnapshot({
      id: "server-only",
      order_number: "TC-SERVER-ONLY",
    });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [serverOnly], error: null })),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    saveStoredOrders([cachedOnly]);

    await ensureOrdersHydrated({ force: true });

    expect(getStoredOrders().map((order) => order.order_number)).toEqual([
      "TC-SERVER-ONLY",
    ]);
  });

  test("does not let hydration that began before a successful write regress workflow state", async () => {
    installMemoryStorage();
    const hydrationResult = createDeferred<{ data: unknown[]; error: null }>();
    let persistedPayload: Record<string, unknown> | null = null;
    let hydrationCount = 0;

    const supabaseClient = {
      from: vi.fn(() => {
        let operation = "list";
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => {
            hydrationCount += 1;
            return hydrationCount === 1
              ? Promise.resolve({ data: [orderSnapshot()], error: null })
              : hydrationResult.promise;
          }),
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
    await ensureOrdersHydrated({ force: true });

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
          order: vi.fn(() =>
            Promise.resolve({ data: [orderSnapshot()], error: null })
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
    await ensureOrdersHydrated({ force: true });

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

  test("keeps deposit workflow activity internal without emitting a second customer notification", async () => {
    installMemoryStorage();
    let persistedPayload: Record<string, unknown> | null = null;
    const query = {
      update: vi.fn((payload) => {
        persistedPayload = payload;
        return query;
      }),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn(() =>
        Promise.resolve({ data: persistedPayload, error: null })
      ),
      order: vi.fn(() =>
        Promise.resolve({ data: [orderSnapshot()], error: null })
      ),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    await ensureOrdersHydrated({ force: true });
    resetNotificationActivityForTests();

    await updateStoredOrder("TC-RACE-1", {
      deposit_required: true,
      deposit_requirement: "required",
      deposit_requirement_status: "Required",
      deposit_workflow_status: "Deposit Requested",
      deposit_amount: 50,
      activity_type: "deposit_request",
      activity_note: "Deposit requested after Square checkout creation.",
    });

    expect(getStoredOrders()[0]).toMatchObject({
      deposit_workflow_status: "Deposit Requested",
      deposit_amount: 50,
    });
    expect(
      getStoredOrders()[0].activity_log.some(
        (event) =>
          event.type === "deposit_request" &&
          event.note === "Deposit requested after Square checkout creation."
      )
    ).toBe(true);
    expect(
      listNotificationActivity().filter(
        (notification) => notification.eventType === "deposit_requested"
      )
    ).toHaveLength(0);
  });

  test("accepts a newer state from a subsequent successful server hydration", async () => {
    installMemoryStorage();
    let hydrationCount = 0;
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => {
        hydrationCount += 1;
        return Promise.resolve({
          data: [
            orderSnapshot({
              artwork_approval_status:
                hydrationCount === 1 ? "Pending Review" : "Approved",
              artwork_status:
                hydrationCount === 1 ? "Pending Review" : "Approved",
            }),
          ],
          error: null,
        });
      }),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });

    await ensureOrdersHydrated({ force: true });
    expect(getStoredOrders()[0].artwork_approval_status).toBe("Pending Review");

    await ensureOrdersHydrated({ force: true });
    expect(getStoredOrders()[0].artwork_approval_status).toBe("Approved");
  });

  test("ignores browser storage changes after server readiness", async () => {
    const { storage, dispatchStorage } = installMemoryStorage();
    const remote = orderSnapshot({
      artwork_approval_status: "Pending Review",
      artwork_status: "Pending Review",
    });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [remote], error: null })),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    const listener = vi.fn();
    const unsubscribe = subscribeToStoredOrders(listener);
    await ensureOrdersHydrated();

    storage.setItem(
      "teeCoStaffOrders",
      JSON.stringify({
        schemaVersion: 2,
        scope: "production:https://production.example.test:anonymous",
        serverConfirmed: false,
        orders: [
          orderSnapshot({
            artwork_approval_status: "Approved",
            artwork_status: "Approved",
          }),
        ],
      })
    );
    const callsBeforeStorageEvent = listener.mock.calls.length;
    dispatchStorage("teeCoStaffOrders");

    expect(listener).toHaveBeenCalledTimes(callsBeforeStorageEvent);
    expect(getStoredOrders()[0].artwork_approval_status).toBe("Pending Review");
    unsubscribe();
  });

  test("rejects production workflow mutations while data is only provisional", async () => {
    installMemoryStorage();
    const update = vi.fn();
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => ({ update })) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });
    saveStoredOrders([orderSnapshot()]);

    await expect(
      updateStoredOrder("TC-RACE-1", {
        artwork_approval_status: "Approved",
      })
    ).rejects.toMatchObject({
      code: "ORDERS_SERVER_HYDRATION_REQUIRED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("rewrites incompatible legacy caches without affecting draft recovery", async () => {
    const { storage } = installMemoryStorage();
    storage.setItem(
      "teeCoStaffOrders",
      JSON.stringify([
        orderSnapshot({
          order_number: "TC-LEGACY",
          artwork_approval_status: "Approved",
        }),
      ])
    );
    savePendingCustomerRequest({
      contactName: "Draft Customer",
      notes: "Preserve this draft",
    });
    const savedDraft = storage.getItem("teeCoPendingCustomerRequest");
    const remote = orderSnapshot({ order_number: "TC-SERVER" });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [remote], error: null })),
    };
    configureOrdersPersistenceForTests({
      supabaseClient: { from: vi.fn(() => query) },
      supabaseConfigured: true,
      persistenceMode: PERSISTENCE_MODES.production,
    });

    expect(getStoredOrders()).toEqual([]);
    await ensureOrdersHydrated({ force: true });

    const rewrittenCache = JSON.parse(
      storage.getItem("teeCoStaffOrders") || "{}"
    );
    expect(rewrittenCache).toMatchObject({
      schemaVersion: 2,
      scope: "production:https://production.example.test:anonymous",
      serverConfirmed: true,
    });
    expect(rewrittenCache.orders.map((order) => order.order_number)).toEqual([
      "TC-SERVER",
    ]);
    expect(storage.getItem("teeCoPendingCustomerRequest")).toBe(savedDraft);
    expect(getPendingCustomerRequest()).toMatchObject({
      notes: "Preserve this draft",
    });
  });
});
