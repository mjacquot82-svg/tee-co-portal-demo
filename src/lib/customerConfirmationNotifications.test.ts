import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  configureCustomerConfirmationNotificationsForTests,
  notifyApprovalDecision,
  notifyCustomerOrderAction,
} from "./customerConfirmationNotifications";
import { orderMatchesConfirmation } from "./customerConfirmationEvents";
import { applyCustomerOrderAction, configureOrdersPersistenceForTests, saveStoredOrders } from "./ordersStore";
import { PERSISTENCE_MODES } from "./persistenceMode";

const STAMP = "2026-10-19T17:00:00.123+00:00";
const okFetch = () => vi.fn(async (_url: string, init: { body: string }) => ({ ok: true, json: async () => ({ businessEvent: JSON.parse(init.body).businessEvent }) }));
const sent = (fetchImpl: ReturnType<typeof vi.fn>) => fetchImpl.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body).businessEvent);

function installMemoryStorage() {
  const values = new Map<string, string>();
  const storage = { getItem: vi.fn((k: string) => values.get(k) ?? null), setItem: vi.fn((k: string, v: string) => void values.set(k, v)), removeItem: vi.fn((k: string) => void values.delete(k)) };
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: storage, location: { origin: "https://teeandco.example.test" }, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
}
const baseOrder = { id: "11111111-1111-4111-8111-111111111111", order_number: "TC-N-1", customer_id: "cust-1", customer_name: "N", request_type: "Order Request", status: "New", quote_status: "Awaiting Deposit", deposit_required: true, deposit_amount: 50 };

beforeEach(() => installMemoryStorage());
afterEach(() => {
  configureCustomerConfirmationNotificationsForTests();
  configureOrdersPersistenceForTests();
  vi.unstubAllGlobals();
});

describe("customer confirmation emails", () => {
  test("portal action event carries only the order number, tied to the saved updated_at", async () => {
    const fetchImpl = okFetch();
    configureCustomerConfirmationNotificationsForTests({ fetchImpl });
    expect(await notifyCustomerOrderAction("artwork_help", { order_number: "TC-1", updated_at: STAMP, customer_email: "x@y.z", total_price: 99 })).toBe(true);
    const [event] = sent(fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("/.netlify/functions/notification-event-accept");
    expect(event).toMatchObject({ event_type: "artwork_help_requested", subject_type: "order", subject_id: "TC-1", occurrence_id: `artwork_help_requested:TC-1:${STAMP}` });
    expect(JSON.stringify(event)).not.toMatch(/x@y\.z|99/);
  });

  test("same action announced twice produces the identical event (deduplicated by the pipeline)", async () => {
    const fetchImpl = okFetch();
    configureCustomerConfirmationNotificationsForTests({ fetchImpl });
    await notifyCustomerOrderAction("deposit_sent", { order_number: "TC-1", updated_at: STAMP });
    await notifyCustomerOrderAction("deposit_sent", { order_number: "TC-1", updated_at: STAMP });
    const [a, b] = sent(fetchImpl);
    expect(a.id).toBe(b.id);
    expect(a.occurrence_id).toBe(b.occurrence_id);
  });

  test("approval decisions: approve uses the existing quote_approved email, changes use the new one", async () => {
    const fetchImpl = okFetch();
    configureCustomerConfirmationNotificationsForTests({ fetchImpl });
    await notifyApprovalDecision("TC-1", "approve", { decided_at: STAMP });
    await notifyApprovalDecision("TC-1", "request_changes", { decided_at: STAMP });
    const [a, b] = sent(fetchImpl);
    expect(a).toMatchObject({ event_type: "quote_approved", occurrence_id: "quote_approved:TC-1" });
    expect(b).toMatchObject({ event_type: "approval_changes_requested", occurrence_id: `approval_changes_requested:TC-1:${STAMP}` });
  });

  test("email failures resolve to false and never throw", async () => {
    configureCustomerConfirmationNotificationsForTests({ fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    await expect(notifyCustomerOrderAction("deposit_sent", { order_number: "TC-1", updated_at: STAMP })).resolves.toBe(false);
    configureCustomerConfirmationNotificationsForTests({ fetchImpl: vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "x" }) })) });
    await expect(notifyApprovalDecision("TC-1", "request_changes", {})).resolves.toBe(false);
  });

  test("a portal action succeeds and sends its email; an email outage does not block it", async () => {
    const savedRow = { ...baseOrder, updated_at: STAMP, deposit_details: { customer_confirmation_status: "sent" }, quote: { __tee_co_order_snapshot: { ...baseOrder } } };
    configureOrdersPersistenceForTests({ supabaseClient: { rpc: vi.fn(async () => ({ data: savedRow, error: null })), from: vi.fn() }, supabaseConfigured: true, persistenceMode: PERSISTENCE_MODES.production });
    saveStoredOrders([baseOrder]);
    const fetchImpl = okFetch();
    configureCustomerConfirmationNotificationsForTests({ fetchImpl });
    const updated = await applyCustomerOrderAction("TC-N-1", "deposit_sent", { note: "" }, {});
    expect(updated?.order_number).toBe("TC-N-1");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(sent(fetchImpl)[0].event_type).toBe("deposit_sent_noted");

    configureCustomerConfirmationNotificationsForTests({ fetchImpl: vi.fn(async () => { throw new Error("email down"); }) });
    await expect(applyCustomerOrderAction("TC-N-1", "deposit_sent", { note: "" }, {})).resolves.toBeTruthy();
  });

  test("demo/local mode sends nothing", async () => {
    configureOrdersPersistenceForTests({ supabaseConfigured: false, persistenceMode: PERSISTENCE_MODES.demo });
    saveStoredOrders([baseOrder]);
    const fetchImpl = okFetch();
    configureCustomerConfirmationNotificationsForTests({ fetchImpl });
    await applyCustomerOrderAction("TC-N-1", "artwork_upload_later", {}, { artwork_status: "Missing" });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("server-side state checks", () => {
    expect(orderMatchesConfirmation("artwork_uploaded", { artwork_status: "Pending Review" })).toBe(true);
    expect(orderMatchesConfirmation("artwork_uploaded", { artwork_status: "Missing", quote: { __tee_co_order_snapshot: { artwork_requirement: "Uploaded" } } })).toBe(false);
    expect(orderMatchesConfirmation("deposit_sent_noted", { quote: { __tee_co_order_snapshot: { deposit_customer_confirmation_status: "Sent" } } })).toBe(true);
    expect(orderMatchesConfirmation("unknown", {})).toBe(false);
  });
});
