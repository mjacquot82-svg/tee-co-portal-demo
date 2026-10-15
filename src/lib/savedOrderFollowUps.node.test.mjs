// Run: node --test --test-concurrency=1 src/lib/savedOrderFollowUps.node.test.mjs
// ordersStore.js imports React/Supabase/Vite-only modules and is not importable
// in plain Node, so its follow-up isolation is tested through the extracted
// pure helper (runSavedOrderFollowUps) and the recovery/view helpers it feeds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLLOW_UP_WARNINGS, runSavedOrderFollowUps } from "./savedOrderFollowUps.js";
import { buildSubmittedView } from "./orderSubmittedView.js";
import {
  createRecoveryStore,
  reconcileExistingOrder,
  submitOrderWithRecovery,
  withClientSubmissionKey,
} from "./artworkSubmissionRecovery.js";

const quiet = () => {
  const original = console.error;
  console.error = () => {};
  return () => (console.error = original);
};

const kinds = ["processing", "timeline", "notification"];

for (const failing of kinds) {
  test(`follow-up "${failing}" failing: no throw, other follow-ups still run, warning collected`, async () => {
    const ran = [];
    const restore = quiet();
    try {
      const warnings = await runSavedOrderFollowUps(
        "TC-1",
        kinds.map((kind) => ({
          warning: FOLLOW_UP_WARNINGS[kind],
          run: async () => {
            ran.push(kind);
            if (kind === failing) throw new Error(`${kind} down`);
          },
        }))
      );
      assert.deepEqual(ran, kinds);
      assert.deepEqual(warnings, [FOLLOW_UP_WARNINGS[failing]]);
    } finally {
      restore();
    }
  });
}

test("all follow-ups failing (sync throw too) collects every warning once, no throw", async () => {
  const restore = quiet();
  try {
    const warnings = await runSavedOrderFollowUps("TC-1", [
      { warning: FOLLOW_UP_WARNINGS.processing, run: () => { throw new Error("sync"); } },
      { warning: FOLLOW_UP_WARNINGS.timeline, run: () => Promise.reject(new Error("async")) },
      { warning: FOLLOW_UP_WARNINGS.timeline, run: () => Promise.reject(new Error("dup")) },
    ]);
    assert.deepEqual(warnings, [FOLLOW_UP_WARNINGS.processing, FOLLOW_UP_WARNINGS.timeline]);
  } finally {
    restore();
  }
});

test("no failures -> no warnings", async () => {
  assert.deepEqual(await runSavedOrderFollowUps("TC-1", [{ warning: "x", run: async () => {} }]), []);
});

test("buildSubmittedView shows follow-up warnings in full and receipt-only modes", () => {
  const followUpWarnings = [FOLLOW_UP_WARNINGS.notification, FOLLOW_UP_WARNINGS.accountSummary];
  const full = buildSubmittedView({ createdOrderNumber: "TC-9", followUpWarnings, artworkLinkWarning: "link" });
  assert.equal(full.mode, "full");
  assert.deepEqual(full.warnings, ["link", ...followUpWarnings]);
  const receipt = buildSubmittedView({ receiptOnly: true, createdOrderNumber: "TC-9", followUpWarnings, garmentName: "Draft" });
  assert.deepEqual(receipt, { mode: "receipt", orderNumber: "TC-9", warnings: followUpWarnings, myOrdersPath: "/portal/orders" });
});

test("submitOrderWithRecovery passes follow-up warnings through with the saved order", async () => {
  const storage = memStorage();
  const binding = { customerId: "c", authUserId: "a", draftId: "d" };
  const result = await submitOrderWithRecovery(createRecoveryStore(storage, binding), {
    create: async () => ({ order: { order_number: "TC-5" }, artworkLink: { status: "linked" }, followUpWarnings: [FOLLOW_UP_WARNINGS.processing] }),
    reconcileOrder: async () => ({ status: "absent" }),
  });
  assert.equal(result.order.order_number, "TC-5");
  assert.deepEqual(result.followUpWarnings, [FOLLOW_UP_WARNINGS.processing]);
});

function memStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, v), removeItem: (k) => map.delete(k) };
}

test("lost create then reconciled: 0 further creates; payload keeps quantity fields + client_submission_key", async () => {
  const storage = memStorage();
  const binding = { customerId: "c", authUserId: "a", draftId: "d" };
  const payload = {
    qty: 7,
    size_breakdown: { M: 3, L: 4 },
    line_items: [{ id: "line-a", size_breakdown: { M: 3 } }, { id: "line-b", size_breakdown: { L: 4 } }],
    quote: { total_quantity: 7 },
    order_metadata: { existing_key: "keep" },
  };
  const created = [];
  let lost = true;
  const deps = {
    create: async (key) => {
      created.push(withClientSubmissionKey(payload, key));
      if (lost) throw new Error("network lost");
      return { order: { order_number: "TC-NEW" } };
    },
    reconcileOrder: async (key) => ({ status: "found", order: { order_number: "TC-ORIG", key } }),
  };
  const first = await submitOrderWithRecovery(createRecoveryStore(storage, binding), deps);
  assert.equal(first.order.order_number, "TC-ORIG");
  assert.equal(created.length, 1);
  const sent = created[0];
  assert.equal(sent.qty, 7);
  assert.deepEqual(sent.size_breakdown, { M: 3, L: 4 });
  assert.deepEqual(sent.line_items, payload.line_items);
  assert.deepEqual(sent.quote, { total_quantity: 7 });
  assert.equal(sent.order_metadata.existing_key, "keep");
  assert.ok(sent.order_metadata.client_submission_key);
  assert.deepEqual(payload.order_metadata, { existing_key: "keep" }, "input payload not mutated");

  lost = false;
  for (let i = 0; i < 3; i += 1) {
    const again = await reconcileExistingOrder(createRecoveryStore(storage, binding), deps);
    assert.equal(again.order.order_number, "TC-ORIG");
    const viaSubmit = await submitOrderWithRecovery(createRecoveryStore(storage, binding), deps);
    assert.equal(viaSubmit.order.order_number, "TC-ORIG");
  }
  assert.equal(created.length, 1, "no further create after reconciliation");
});

test("withClientSubmissionKey tolerates missing/invalid order_metadata", () => {
  assert.deepEqual(withClientSubmissionKey({ qty: 1 }, "k"), { qty: 1, order_metadata: { client_submission_key: "k" } });
  assert.deepEqual(withClientSubmissionKey({ qty: 1, order_metadata: [] }, "k").order_metadata, { client_submission_key: "k" });
});
