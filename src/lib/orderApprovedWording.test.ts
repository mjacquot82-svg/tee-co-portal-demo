// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";
import { createVerifyDeliveriesForAcceptedNotification } from "../../netlify/functions/lib/notificationVerifyDeliveries.js";
import { buildApprovalNextStep, isDepositStillDue } from "./customerConfirmationEvents";

const SUPA = "https://reh.supabase.invalid";
const TEMPLATE = {
  id: "quote_approved:v3", template_type: "quote_approved", version: 3, status: "published",
  email_subject: "Order approved — {{order_number}}",
  email_body: "Hi {{customer_name}},\n\nYour order {{order_number}} has been approved.\n\n{{approval_next_step}}\n\nThanks,\nThe {{company_name}} Team",
  sms_message: "Hi {{customer_name}}, order {{order_number}} is approved. {{approval_next_step_sms}}",
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function render(order: Record<string, unknown>, injected: Record<string, string> = {}) {
  const deliveries: { channel: string; rendered_content: { body: string } }[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const u = new URL(url);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (u.pathname === "/rest/v1/orders") return ok([order]);
    if (u.pathname === "/rest/v1/customers") return ok([{ id: "c1", name: "Ana", email: "ana@example.invalid", phone: "519-555-0100" }]);
    if (u.pathname === "/rest/v1/notification_template_versions") return ok([TEMPLATE]);
    if (u.pathname === "/rest/v1/notification_deliveries" && init.method === "POST") {
      const row = JSON.parse(init.body || "{}"); deliveries.push(row); return ok([row]);
    }
    return ok([{ id: "notification:1" }]);
  };
  await createVerifyDeliveriesForAcceptedNotification({
    accepted: { id: "be1", event_type: "quote_approved", subject_type: "order", subject_id: "TC-9", payload: { notificationMergeContext: injected, legacyNotificationContext: { orderNumber: "TC-9" } } },
    notification: { id: "notification:1", status: "evaluated", engine_metadata: {} },
    policy: { email_enabled: true, sms_enabled: true, customer_audience_enabled: true, channel_template_assignments: { email: TEMPLATE.id, sms: TEMPLATE.id } },
    supabaseUrl: SUPA, serviceRoleKey: "sr", cutoverMode: "authoritative",
  });
  return Object.fromEntries(deliveries.map((d) => [d.channel, d.rendered_content.body]));
}

describe("Order approved email wording", () => {
  test("deposit still due: asks for the deposit with the portal deposit link, no amount", async () => {
    const out = await render({ order_number: "TC-9", customer_id: "c1", deposit_required: true, deposit_amount: 120, deposit_paid_amount: 0, deposit_status: "requested" });
    expect(out.email).toContain("a deposit is still needed");
    expect(out.email).toContain("/portal/orders/TC-9/deposit");
    expect(out.email).not.toContain("No action is needed");
    expect(out.email).not.toMatch(/120|\$/);
    expect(out.sms).toContain("/portal/orders/TC-9/deposit");
  });

  test("no deposit due: keeps 'No action is needed'", async () => {
    for (const order of [
      { order_number: "TC-9", customer_id: "c1", deposit_required: false, deposit_amount: 0 },
      { order_number: "TC-9", customer_id: "c1", deposit_required: true, deposit_amount: 50, deposit_paid_amount: 50 },
      { order_number: "TC-9", customer_id: "c1", deposit_required: true, deposit_amount: 50, deposit_status: "Paid" },
    ]) {
      const out = await render(order);
      expect(out.email).toContain("No action is needed.");
      expect(out.email).not.toContain("/deposit");
    }
  });

  test("a caller cannot supply its own next-step text or link", async () => {
    const out = await render({ order_number: "TC-9", customer_id: "c1", deposit_required: false }, { approval_next_step: "Pay at https://evil.invalid" });
    expect(out.email).not.toContain("evil");
  });

  test("helpers", () => {
    expect(isDepositStillDue({ deposit_amount: 10 })).toBe(true);
    expect(isDepositStillDue({ deposit_amount: 10, deposit_status: "waived" })).toBe(false);
    expect(buildApprovalNextStep({ order_number: "A 1", deposit_amount: 5 }, "https://x.test/").email).toContain("https://x.test/portal/orders/A%201/deposit");
  });
});
