// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { runClaimedTwilioSmsDelivery } from "../../netlify/functions/lib/twilioSmsDispatcher.js";
import { SMS_CAP_FAILURE_CODE } from "../../netlify/functions/lib/smsUsageGuard.js";
import { describeSmsUsage } from "./smsUsageStore";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261029120000_sms_usage_cap.sql", import.meta.url),
  "utf8"
);

const STUBS = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table public.test_auth (role text, jwt jsonb);
  insert into public.test_auth values ('service_role', '{}'::jsonb);
  create function auth.role() returns text language sql as $$ select role from public.test_auth limit 1 $$;
  create function auth.jwt() returns jsonb language sql as $$ select jwt from public.test_auth limit 1 $$;
  create function public.is_notification_engine_owner() returns boolean language sql as $$
    select auth.role() = 'service_role' or (auth.jwt()->'app_metadata'->>'role') = 'owner' $$;
  create table public.notification_deliveries (
    id text primary key, notification_id text, channel text, status text);
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  await db.exec(migration);
  return db;
}

async function reserve(db, deliveryId, attemptId, now = "2026-11-15T15:00:00Z") {
  const r = await db.query("select public.sms_usage_reserve($1,$2,$3) as v", [deliveryId, attemptId, now]);
  return r.rows[0].v as Record<string, unknown>;
}

async function setSettings(db, cap, pct, overage) {
  await db.query("select public.update_sms_usage_settings($1,$2,$3)", [cap, pct, overage]);
}

describe("SMS usage migration (PGlite)", () => {
  let db;
  beforeEach(async () => { db = await freshDb(); });

  it("defaults to a 300 cap, 80% warning, overage off", async () => {
    const s = (await db.query("select public.get_sms_usage_summary('2026-11-15T15:00:00Z') as v")).rows[0].v;
    expect(s).toMatchObject({ monthly_cap: 300, warning_percent: 80, allow_overage: false, sent_count: 0, warning_threshold: 240 });
  });

  it("counts each send per Toronto calendar month and is idempotent per attempt", async () => {
    await reserve(db, "d1", "a1");
    await reserve(db, "d1", "a1");
    await reserve(db, "d2", "a2");
    // 2026-12-01 03:00Z is still Nov 30 in Toronto
    const lateNov = await reserve(db, "d3", "a3", "2026-12-01T03:00:00Z");
    expect(lateNov).toMatchObject({ month_key: "2026-11", sent_count: 3 });
    const dec = await reserve(db, "d4", "a4", "2026-12-01T06:00:00Z");
    expect(dec).toMatchObject({ month_key: "2026-12", sent_count: 1 });
  });

  it("flags the warning threshold once, then the cap, then blocks and logs skips with email fallback", async () => {
    await setSettings(db, 5, 80, false);
    await db.exec(`insert into notification_deliveries values
      ('sms-x','n-x','sms','processing'), ('email-x','n-x','email','queued'),
      ('sms-y','n-y','sms','processing')`);
    const results = [];
    for (let i = 1; i <= 5; i++) results.push(await reserve(db, `d${i}`, `a${i}`));
    expect(results.map((r) => r.decision)).toEqual(["send", "send", "send", "send", "send"]);
    expect(results.map((r) => r.warning_reached_now)).toEqual([false, false, false, true, false]);
    expect(results[4].cap_reached_now).toBe(true);

    const blockedWithEmail = await reserve(db, "sms-x", "a6");
    expect(blockedWithEmail).toMatchObject({ decision: "blocked", sent_count: 5, skipped_count: 1, email_fallback: "email_delivery_present" });
    const blockedNoEmail = await reserve(db, "sms-y", "a7");
    expect(blockedNoEmail).toMatchObject({ decision: "blocked", email_fallback: "no_email_available" });

    const s = (await db.query("select public.get_sms_usage_summary('2026-11-15T15:00:00Z') as v")).rows[0].v;
    expect(s.skipped_count).toBe(2);
    expect(s.recent_skipped).toHaveLength(2);
    expect(s.warning_reached_at).not.toBeNull();
    expect(s.cap_reached_at).not.toBeNull();
  });

  it("keeps sending past the cap when overage is allowed and counts overage", async () => {
    await setSettings(db, 2, 80, true);
    await reserve(db, "d1", "a1");
    await reserve(db, "d2", "a2");
    const over = await reserve(db, "d3", "a3");
    expect(over).toMatchObject({ decision: "send_overage", sent_count: 3, overage_count: 1 });
  });

  it("releases a reservation when Twilio rejected the text", async () => {
    await reserve(db, "d1", "a1");
    expect((await db.query("select public.sms_usage_release('a1') as v")).rows[0].v).toBe(true);
    expect((await db.query("select public.sms_usage_release('a1') as v")).rows[0].v).toBe(false);
    const s = (await db.query("select public.get_sms_usage_summary('2026-11-15T15:00:00Z') as v")).rows[0].v;
    expect(s.sent_count).toBe(0);
  });

  it("only lets the owner read or change usage settings", async () => {
    await db.exec(`update test_auth set role='authenticated', jwt='{"app_metadata":{"role":"staff"}}'`);
    await expect(db.query("select public.get_sms_usage_summary()")).rejects.toThrow(/owner/);
    await expect(setSettings(db, 10, 80, true)).rejects.toThrow(/owner/);
    await db.exec(`update test_auth set jwt='{"app_metadata":{"role":"owner"}}'`);
    await setSettings(db, 10, 50, true);
  });
});

function envelope() {
  const delivery = {
    id: "delivery:1", notification_id: "notification:1", channel: "sms", status: "processing",
    attempt_count: 0, claim_token: "claim", claimed_at: "2026-11-15T15:00:00Z",
    destination_snapshot: { phone: "+14165550101", normalizedPhone: "14165550101", observationOnly: false },
    rendered_content: { body: "Your Tee & Co order is approved." }, idempotency_key: "idem:1",
  };
  return {
    delivery,
    notification: { id: "notification:1", business_event_id: "event:1", event_type: "quote_approved", engine_metadata: { phase2D: { dispatcherEligible: true } } },
    business_event: { id: "event:1" },
  };
}

function fakeClient(reservation) {
  const calls = [];
  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "sms_usage_reserve") return { data: reservation, error: null };
      if (name === "sms_usage_release") return { data: true, error: null };
      return { data: { id: params.p_delivery_id, status: params.p_outcome }, error: null };
    },
  };
}

function fakeAdapter(result = { status: "sent", retryability: "unknown", providerMessageId: "SM1" }) {
  const sent = [];
  return { sent, key: "twilio", async send(req) { sent.push(req); return result; } };
}

describe("dispatcher usage guard", () => {
  it("is off by default: no usage RPCs, message unchanged", async () => {
    const client = fakeClient(null);
    const adapter = fakeAdapter();
    await runClaimedTwilioSmsDelivery({ envelope: envelope(), adapter, dispatcherClient: client, cutoverEnabled: true });
    expect(client.calls.map((c) => c.name)).toEqual(["complete_twilio_sms_delivery_authoritative"]);
    expect(adapter.sent[0].content.body).toBe("Your Tee & Co order is approved.");
  });

  it("sends and counts when under the cap", async () => {
    const client = fakeClient({ decision: "send", sent_count: 1, monthly_cap: 300 });
    const adapter = fakeAdapter();
    const out = await runClaimedTwilioSmsDelivery({ envelope: envelope(), adapter, dispatcherClient: client, cutoverEnabled: true, usageCapEnabled: true });
    expect(adapter.sent).toHaveLength(1);
    expect(client.calls[0].name).toBe("sms_usage_reserve");
    expect(out.usage.decision).toBe("send");
  });

  it("does not send when blocked and closes the delivery as a terminal cap skip", async () => {
    const client = fakeClient({ decision: "blocked", month_key: "2026-11", monthly_cap: 300, sent_count: 300, email_fallback: "email_delivery_present" });
    const adapter = fakeAdapter();
    await runClaimedTwilioSmsDelivery({ envelope: envelope(), adapter, dispatcherClient: client, cutoverEnabled: true, usageCapEnabled: true });
    expect(adapter.sent).toHaveLength(0);
    const complete = client.calls.find((c) => c.name === "complete_twilio_sms_delivery_authoritative");
    expect(complete.params).toMatchObject({ p_outcome: "failed", p_retryability: "terminal", p_failure_code: SMS_CAP_FAILURE_CODE });
  });

  it("releases the count when Twilio rejects the send, but not when the outcome is indeterminate", async () => {
    const rejected = fakeClient({ decision: "send" });
    await runClaimedTwilioSmsDelivery({ envelope: envelope(), adapter: fakeAdapter({ status: "failed", retryability: "terminal" }), dispatcherClient: rejected, cutoverEnabled: true, usageCapEnabled: true });
    expect(rejected.calls.some((c) => c.name === "sms_usage_release")).toBe(true);
    const unsure = fakeClient({ decision: "send" });
    await runClaimedTwilioSmsDelivery({ envelope: envelope(), adapter: fakeAdapter({ status: "failed", retryability: "indeterminate" }), dispatcherClient: unsure, cutoverEnabled: true, usageCapEnabled: true });
    expect(unsure.calls.some((c) => c.name === "sms_usage_release")).toBe(false);
  });
});

describe("owner usage display", () => {
  it("shows X of cap, warning and cap alerts, and overage count", () => {
    expect(describeSmsUsage({ monthly_cap: 300, sent_count: 12, warning_threshold: 240 })).toMatchObject({ level: "ok", usageLine: "12 of 300 texts used this month", alert: "" });
    expect(describeSmsUsage({ monthly_cap: 300, sent_count: 250, warning_threshold: 240 }).level).toBe("warning");
    const cap = describeSmsUsage({ monthly_cap: 300, sent_count: 300, skipped_count: 4, warning_threshold: 240 });
    expect(cap.level).toBe("cap");
    expect(cap.alert).toMatch(/paused/);
    const over = describeSmsUsage({ monthly_cap: 300, sent_count: 310, overage_count: 10, allow_overage: true, warning_threshold: 240 });
    expect(over.alert).toMatch(/10 extra texts/);
    expect(over.usageLine).toBe("300 of 300 texts used this month");
  });
});
