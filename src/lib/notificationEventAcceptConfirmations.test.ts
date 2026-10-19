// @vitest-environment node
// Runs under Vitest (not node --test) because the function's delivery module uses bundler-style imports.
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/notification-event-accept.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SUPA = "https://reh.supabase.invalid";
const STAMP = "2026-10-19T17:00:00.123456+00:00";

function install({ order, policyFound = true }: { order?: Record<string, unknown> | null; policyFound?: boolean } = {}) {
  const calls: { path: string; method: string; search: string; body: { id: string; source: string; payload: { notificationMergeContext: Record<string, string> } } }[] = [];
  process.env.SUPABASE_URL = SUPA;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr-test";
  process.env.VITE_SITE_URL = "https://teeandco.jdsstudio.ca";
  process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE = "legacy";
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const u = new URL(url); const method = init.method || "GET";
    calls.push({ path: u.pathname, method, search: u.search, body: init.body ? JSON.parse(init.body) : null });
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (u.pathname === "/rest/v1/orders") return ok(order ? [order] : []);
    if (u.pathname === "/rest/v1/notification_business_events" && method === "POST") return ok([{ ...JSON.parse(init.body) }]);
    if (u.pathname === "/rest/v1/notification_business_events") return ok([]);
    if (u.pathname === "/rest/v1/notification_policies") return ok(policyFound ? [{ id: "policy:x:v1", version: 1, enabled: true, delivery_mode: "automatic", email_enabled: true }] : []);
    if (u.pathname === "/rest/v1/notifications" && method === "POST") return ok([{ id: "notification:1", status: "evaluated" }]);
    return ok([]);
  };
  return calls;
}
const post = (businessEvent: Record<string, unknown>) => handler({ httpMethod: "POST", body: JSON.stringify({ businessEvent }) });
const event = (over: Record<string, unknown> = {}) => ({
  id: "client-chosen", event_type: "deposit_sent_noted", subject_type: "order", subject_id: "TC-1",
  occurrence_id: `deposit_sent_noted:TC-1:${STAMP}`, occurred_at: STAMP,
  payload: { notificationMergeContext: { portal_link: "https://evil.invalid", customer_name: "Injected" } }, ...over,
});
const depositOrder = { order_number: "TC-1", updated_at: STAMP, deposit_details: { customer_confirmation_status: "sent" }, artwork_status: "", approval_status: "", quote: {} };

test("a real customer action is accepted with server-built, injection-free content", async () => {
  const calls = install({ order: depositOrder });
  const res = await post(event());
  assert.equal(res.statusCode, 200);
  const insert = calls.find((c) => c.path === "/rest/v1/notification_business_events" && c.method === "POST");
  assert.equal(insert.body.id, `customer-confirmation:deposit_sent_noted:TC-1:${STAMP}`);
  assert.deepEqual(insert.body.payload.notificationMergeContext, { order_number: "TC-1", portal_link: "https://teeandco.jdsstudio.ca/portal/orders/TC-1" });
  assert.equal(insert.body.source, "customer_confirmation");
  assert.ok(!JSON.stringify(insert.body).includes("evil"));
});

test("events not tied to the order's current change are refused (no event stored)", async () => {
  let calls = install({ order: { ...depositOrder, updated_at: "2026-10-19T18:00:00+00:00" } });
  assert.equal((await post(event())).statusCode, 409);
  assert.ok(!calls.some((c) => c.path === "/rest/v1/notification_business_events"));
  calls = install({ order: { ...depositOrder, deposit_details: {} } });
  assert.equal((await post(event())).statusCode, 409, "order does not show the deposit as sent");
  calls = install({ order: null });
  assert.equal((await post(event())).statusCode, 409, "unknown order");
  calls = install({ order: depositOrder });
  assert.equal((await post(event({ occurrence_id: "deposit_sent_noted:TC-2:" + STAMP }))).statusCode, 409, "occurrence for another order");
  assert.equal((await post(event({ subject_type: "payment" }))).statusCode, 409);
});

test("each confirmation type checks its own order state", async () => {
  const cases = [
    ["artwork_uploaded", { artwork_status: "Pending Review" }, { artwork_status: "Missing" }],
    ["artwork_upload_later", { artwork_status: "Missing" }, { artwork_status: "Approved" }],
    ["artwork_help_requested", { artwork_status: "Help Requested" }, { artwork_status: "Missing" }],
    ["approval_changes_requested", { approval_status: "Customer Requested Changes" }, { approval_status: "Customer Approved" }],
  ];
  for (const [type, good, bad] of cases) {
    install({ order: { order_number: "TC-1", updated_at: STAMP, quote: {}, ...good } });
    assert.equal((await post(event({ event_type: type, occurrence_id: `${type}:TC-1:${STAMP}` }))).statusCode, 200, type);
    install({ order: { order_number: "TC-1", updated_at: STAMP, quote: {}, ...bad } });
    assert.equal((await post(event({ event_type: type, occurrence_id: `${type}:TC-1:${STAMP}` }))).statusCode, 409, type + " wrong state");
  }
});

test("existing event types are unchanged (no order check added)", async () => {
  const calls = install({ order: null });
  const res = await post({ id: "e1", event_type: "quote_approved", subject_type: "order", subject_id: "TC-1", occurrence_id: "quote_approved:TC-1", occurred_at: STAMP, payload: {} });
  assert.equal(res.statusCode, 200);
  assert.ok(!calls.some((c) => c.path === "/rest/v1/orders"));
});
