// @ts-check
import { expect, test } from "@playwright/test";
import {
  authorizeOperationalRequest,
  buildTerminalCheckoutPayload,
  getTerminalPaymentVerificationMismatches,
  isTerminalCheckoutEnabled,
  mapTerminalCheckoutStatus,
  processTerminalCheckoutWebhook,
  recoverTerminalAttemptForPaymentWebhook,
  TERMINAL_ACTIVE_STATUSES,
  TERMINAL_SQUARE_VERSION,
} from "../netlify/functions/lib/squareTerminalCheckout.js";
import { readFile } from "node:fs/promises";
import {
  cancelSquareTerminalCheckout,
  createSquareTerminalCheckout,
  getSquareTerminalCheckoutStatus,
  TERMINAL_FINAL_STATES,
} from "../src/services/squareTerminalCheckoutService.js";

test("Terminal checkout payload is exact, five-minute, no-tip and receipt-enabled", () => {
  expect(TERMINAL_SQUARE_VERSION).toBe("2026-07-15");
  expect(buildTerminalCheckoutPayload({
    attemptId: "attempt-1", amount: 12.34, currency: "cad", referenceId: "tc_reference",
    orderNumber: "TC-100", deviceId: "server-device",
  })).toEqual({
    idempotency_key: "terminal:attempt-1",
    checkout: {
      amount_money: { amount: 1234, currency: "CAD" }, reference_id: "tc_reference",
      note: "Tee & Co TC-100", deadline_duration: "PT5M", payment_options: { autocomplete: true },
      device_options: { device_id: "server-device", skip_receipt_screen: false, tip_settings: { allow_tipping: false } },
    },
  });
});

test("Terminal status mapping distinguishes all required operator states", () => {
  expect(mapTerminalCheckoutStatus("PENDING")).toBe("pending");
  expect(mapTerminalCheckoutStatus("IN_PROGRESS")).toBe("in_progress");
  expect(mapTerminalCheckoutStatus("CANCEL_REQUESTED")).toBe("cancel_requested");
  expect(mapTerminalCheckoutStatus("COMPLETED")).toBe("completed_unverified");
  expect(mapTerminalCheckoutStatus("FAILED")).toBe("failed");
  expect(mapTerminalCheckoutStatus("CANCELED")).toBe("canceled");
  expect(mapTerminalCheckoutStatus("CANCELED", "TIMED_OUT")).toBe("timed_out");
  expect(mapTerminalCheckoutStatus("TIMED_OUT")).toBe("timed_out");
  expect(TERMINAL_ACTIVE_STATUSES).toContain("create_unknown");
  expect(TERMINAL_FINAL_STATES).toEqual(new Set(["completed", "failed", "canceled", "timed_out", "reconciliation_required"]));
});

test("payment verification checks status, amount, currency, location and correlation", () => {
  const attempt = { amount: 10, currency: "CAD", square_location_id: "loc-1", square_reference_id: "tc-ref" };
  const valid = { id: "pay-1", status: "COMPLETED", location_id: "loc-1", reference_id: "tc-ref", amount_money: { amount: 1000, currency: "CAD" } };
  expect(getTerminalPaymentVerificationMismatches(valid, attempt, "pay-1")).toEqual([]);
  expect(getTerminalPaymentVerificationMismatches({ ...valid, reference_id: "" }, attempt, "pay-1")).toEqual(["reference"]);
  expect(getTerminalPaymentVerificationMismatches({
    ...valid,
    tip_money: { amount: 200, currency: "CAD" },
    total_money: { amount: 1200, currency: "CAD" },
  }, attempt, "pay-1")).toEqual(["amount", "tip"]);
  expect(getTerminalPaymentVerificationMismatches({ ...valid, status: "FAILED", location_id: "loc-2", reference_id: "wrong", amount_money: { amount: 999, currency: "USD" } }, attempt, "pay-2"))
    .toEqual(["payment_id", "status", "location", "amount", "currency", "reference"]);
});

test("Terminal creation feature flag is disabled unless explicitly true", () => {
  const previous = process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED;
  delete process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED;
  expect(isTerminalCheckoutEnabled()).toBe(false);
  process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED = "false";
  expect(isTerminalCheckoutEnabled()).toBe(false);
  process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED = "true";
  expect(isTerminalCheckoutEnabled()).toBe(true);
  if (previous == null) delete process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED;
  else process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED = previous;
});

test("authenticated browser service never sends amount or device id", async () => {
  const calls = [];
  const options = { accessToken: "staff-token", endpoint: "/terminal-test", fetcher: async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, json: async () => ({ attempt: { id: "attempt-1", status: "pending" } }) };
  } };
  await createSquareTerminalCheckout({ orderNumber: "TC-100" }, options);
  await getSquareTerminalCheckoutStatus("attempt-1", options);
  await cancelSquareTerminalCheckout("attempt-1", options);
  expect(calls[0].body).toEqual({ orderNumber: "TC-100", paymentRequestId: "" });
  expect(calls[0].body).not.toHaveProperty("amount");
  expect(calls[0].body).not.toHaveProperty("deviceId");
  expect(calls[0].init.headers.Authorization).toBe("Bearer staff-token");
  expect(calls[1].url).toContain("attemptId=attempt-1");
  expect(calls[2].body).toEqual({ action: "cancel", attemptId: "attempt-1" });
});

test("server authorization permits operational staff but reserves owner operations", async () => {
  const event = { headers: { authorization: "Bearer valid" } };
  const staffClient = { auth: { getUser: async () => ({ data: { user: { id: "staff", app_metadata: { operational_role: "staff" } } }, error: null }) } };
  expect(await authorizeOperationalRequest(event, staffClient)).toMatchObject({ ok: true, role: "staff" });
  expect(await authorizeOperationalRequest(event, staffClient, { ownerOnly: true })).toMatchObject({ ok: false, statusCode: 403 });
  const ownerClient = { auth: { getUser: async () => ({ data: { user: { id: "owner", app_metadata: { operational_role: "owner" } } }, error: null }) } };
  expect(await authorizeOperationalRequest(event, ownerClient, { ownerOnly: true })).toMatchObject({ ok: true, role: "owner" });
  expect(await authorizeOperationalRequest({ headers: {} }, ownerClient)).toMatchObject({ ok: false, statusCode: 401 });
});

test("Terminal migration enforces server-only, uniqueness and atomic finalization", async () => {
  const sql = await readFile(new URL("../supabase/square-terminal-phase2.sql", import.meta.url), "utf8");
  expect(sql).toContain("square_terminal_one_active_device_per_location");
  expect(sql).toContain("square_terminal_one_active_attempt_per_target");
  expect(sql).toContain("square_terminal_attempt_checkout_unique");
  expect(sql).toContain("revoke all on table public.square_terminal_checkout_attempts from anon, authenticated");
  expect(sql).toContain("finalize_square_terminal_payment");
  expect(sql).toContain("for update");
  expect(sql).toContain("if v_attempt.status <> 'completed_unverified'");
  expect(sql).toContain("Terminal checkout attempt is not eligible for finalization");
  expect(sql).toContain("where provider = 'square' and provider_payment_id = p_square_payment_id");
});

test("Terminal checkout webhook correlates, updates cancellation, and deduplicates retries", async () => {
  const rows = [{ id: "attempt-1", square_checkout_id: "checkout-1", square_reference_id: "tc-ref", status: "pending", version: 1, square_payment_ids: [] }];
  const client = { from: () => {
    let operation = "select"; let values = {}; let filters = [];
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: rows.find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null }),
      update(next) { operation = "update"; values = next; return query; },
      single: async () => {
        const row = rows.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
        if (operation === "update" && row) Object.assign(row, values);
        return { data: row || null, error: null };
      },
    };
    return query;
  } };
  const event = { event_id: "event-1", created_at: "2026-08-15T10:00:00Z", data: { object: { checkout: { id: "checkout-1", reference_id: "tc-ref", status: "CANCELED", cancel_reason: "BUYER_CANCELED", payment_ids: [], updated_at: "2026-08-15T10:00:00Z" } } } };
  await expect(processTerminalCheckoutWebhook(client, event)).resolves.toMatchObject({ processed: true, attempt: { status: "canceled", cancelReason: "BUYER_CANCELED" } });
  await expect(processTerminalCheckoutWebhook(client, event)).resolves.toMatchObject({ processed: false, duplicate: true });
});

test("out-of-order Terminal webhooks cannot regress a finalized attempt", async () => {
  const rows = [{ id: "attempt-final", square_checkout_id: "checkout-final", square_reference_id: "tc-final", status: "completed", version: 4, square_payment_ids: ["pay-final"] }];
  const client = { from: () => {
    let operation = "select"; let values = {}; let filters = [];
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: rows.find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null }),
      update(next) { operation = "update"; values = next; return query; },
      single: async () => {
        const row = rows.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
        if (operation === "update" && row) Object.assign(row, values);
        return { data: row || null, error: null };
      },
    };
    return query;
  } };
  const event = { event_id: "older-event", created_at: "2026-08-15T09:00:00Z", data: { object: { checkout: { id: "checkout-final", reference_id: "tc-final", status: "PENDING", payment_ids: [] } } } };
  await expect(processTerminalCheckoutWebhook(client, event)).resolves.toMatchObject({ attempt: { status: "completed" } });
  expect(rows[0]).toMatchObject({ status: "completed", version: 4, square_payment_ids: ["pay-final"] });
});

test("payment webhooks preserve Online Checkout before the Terminal migration is applied", async () => {
  const query = {
    select() { return query; }, contains() { return query; }, limit() { return query; },
    maybeSingle: async () => ({ data: null, error: { code: "PGRST205", message: "table unavailable" } }),
  };
  const client = { from: () => query };
  const event = { data: { object: { payment: { id: "online-payment" } } } };
  await expect(recoverTerminalAttemptForPaymentWebhook(client, event)).resolves.toBeNull();
});
