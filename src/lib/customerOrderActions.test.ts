import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyCustomerOrderAction,
  buildOrderApprovalLink,
  configureOrdersPersistenceForTests,
  ensureOrdersHydrated,
  saveStoredOrders,
} from "./ordersStore";
import { PERSISTENCE_MODES } from "./persistenceMode";

function installMemoryStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    removeItem: vi.fn((key: string) => void values.delete(key)),
  };
  vi.stubGlobal("window", {
    localStorage: storage,
    sessionStorage: storage,
    location: { origin: "https://teeandco.example.test" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

const baseOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  order_number: "TC-ACT-1",
  customer_id: "cust-1",
  customer_name: "Action Customer",
  customer_email: "action@example.com",
  request_type: "Order Request",
  status: "New",
  quote_status: "Awaiting Deposit",
  deposit_required: true,
  deposit_amount: 50,
  total_price: 100,
  artwork_files: [],
};

beforeEach(() => installMemoryStorage());
afterEach(() => {
  configureOrdersPersistenceForTests();
  vi.unstubAllGlobals();
});

describe("customer order actions", () => {
  test("with a database, uses customer_order_action and never a direct table update", async () => {
    const from = vi.fn();
    const rpc = vi.fn(async () => ({
      data: {
        ...baseOrder,
        quote: { __tee_co_order_snapshot: { ...baseOrder, deposit_customer_confirmation_status: "Sent" } },
        deposit_details: { customer_confirmation_status: "sent" },
      },
      error: null,
    }));
    configureOrdersPersistenceForTests({ supabaseClient: { rpc, from }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    saveStoredOrders([baseOrder]);

    const updated = await applyCustomerOrderAction("TC-ACT-1", "deposit_sent", { note: "e-transfer" }, { deposit_customer_confirmation_status: "Sent" });

    expect(rpc).toHaveBeenCalledWith("customer_order_action", {
      p_order_number: "TC-ACT-1",
      p_action: "deposit_sent",
      p_payload: { note: "e-transfer" },
    });
    expect(from).not.toHaveBeenCalled();
    expect(updated?.deposit_customer_confirmation_status).toBe("Sent");
  });

  test("database refusals surface as readable errors and leave the order unchanged", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "P0002", message: "Order not found." } }));
    configureOrdersPersistenceForTests({ supabaseClient: { rpc, from: vi.fn() }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    saveStoredOrders([baseOrder]);
    const from = vi.fn();
    configureOrdersPersistenceForTests({ supabaseClient: { rpc, from }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    saveStoredOrders([baseOrder]);
    await expect(applyCustomerOrderAction("TC-ACT-1", "artwork_help", { message: "help" }, {})).rejects.toThrow("Order not found.");
    expect(from).not.toHaveBeenCalled();
  });

  test("before phase B (database function missing) the previous direct update is used", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    const single = vi.fn(async () => ({ data: { ...baseOrder, artwork_status: "Missing" }, error: null }));
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    Object.assign(query, {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: [baseOrder], error: null })),
      single,
    });
    const from = vi.fn(() => query);
    configureOrdersPersistenceForTests({ supabaseClient: { rpc, from }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    await ensureOrdersHydrated();
    await applyCustomerOrderAction("TC-ACT-1", "artwork_upload_later", {}, { artwork_status: "Missing" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  test("demo mode keeps the local update", async () => {
    configureOrdersPersistenceForTests({ supabaseConfigured: false, persistenceMode: PERSISTENCE_MODES.demo });
    saveStoredOrders([baseOrder]);
    const updated = await applyCustomerOrderAction("TC-ACT-1", "artwork_upload_later", {}, { artwork_requirement: "Upload Later", artwork_status: "Missing" });
    expect(updated?.artwork_requirement).toBe("Upload Later");
  });

  test("approval links carry a token from create_order_approval_token, or are skipped", async () => {
    const rpc = vi.fn(async () => ({ data: "ab".repeat(32), error: null }));
    configureOrdersPersistenceForTests({ supabaseClient: { rpc, from: vi.fn() }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    const link = await buildOrderApprovalLink("TC-ACT-1");
    expect(rpc).toHaveBeenCalledWith("create_order_approval_token", { p_order_number: "TC-ACT-1" });
    expect(link).toMatch(/\/approval\/TC-ACT-1\?token=(ab){32}$/);

    configureOrdersPersistenceForTests({ supabaseClient: { rpc: vi.fn(async () => ({ data: null, error: { code: "42501" } })), from: vi.fn() }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    await expect(buildOrderApprovalLink("TC-ACT-1")).resolves.toBe("");
    configureOrdersPersistenceForTests({ supabaseConfigured: false, persistenceMode: PERSISTENCE_MODES.demo });
    await expect(buildOrderApprovalLink("TC-ACT-1")).resolves.toBe("");
  });
});
