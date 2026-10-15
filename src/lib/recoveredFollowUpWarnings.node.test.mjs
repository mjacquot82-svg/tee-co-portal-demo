// Run: node --test --test-concurrency=1 src/lib/recoveredFollowUpWarnings.node.test.mjs
// Follow-up warnings persisted in the confirmed-order receipt and returned on recovery.
// Pure logic with in-memory storage, an exclusive lock fake and scripted deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecoveryStore,
  reconcileExistingOrder,
  RecoveryStateError,
  recoveryStorageKey,
  submitOrderWithRecovery,
  uploadDraftArtworkWithRecovery,
  withRecoveryLock,
} from "./artworkSubmissionRecovery.js";
import { FOLLOW_UP_WARNINGS } from "./savedOrderFollowUps.js";
import { buildSubmittedView } from "./orderSubmittedView.js";

const binding = { customerId: "cust-1", authUserId: "auth-1", draftId: "2026-10-15T10:00:00.000Z" };

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, v), removeItem: (k) => map.delete(k) };
}
function fakeLocks() {
  const held = new Set();
  return {
    async request(name, options, cb) {
      if (held.has(name)) return cb(null);
      held.add(name);
      try { return await cb({ name, mode: options.mode }); } finally { held.delete(name); }
    },
  };
}

function harness({ createWarnings = [], accountSummaryFails = false } = {}) {
  const storage = memoryStorage();
  const locks = fakeLocks();
  const calls = { upload: 0, create: 0, accountSummary: 0, followUps: 0 };
  let n = 0;
  const uploadDeps = {
    buildStoragePath: (asset) => `cust-1/p${++n}-${asset.file.name}`,
    upload: async (_asset, { storagePath }) => { calls.upload += 1; return { id: `art-${storagePath}` }; },
    reconcileUpload: async () => ({ status: "absent" }),
  };
  const orderDeps = {
    create: async () => {
      calls.create += 1;
      calls.followUps += 1; // follow-ups only ever run as part of a create
      return { order: { order_number: "TC-100" }, artworkLink: { status: "linked" }, followUpWarnings: createWarnings };
    },
    reconcileOrder: async () => ({ status: "found", order: { order_number: "TC-100" } }),
  };
  // Mirrors the order screen: lock -> fresh store -> existing order first -> uploads -> order -> account summary.
  async function submit(files, store) {
    return withRecoveryLock(locks, binding, async () => {
      const recoveryStore = store || createRecoveryStore(storage, binding);
      const existing = await reconcileExistingOrder(recoveryStore, orderDeps);
      if (existing) return { receiptOnly: true, ...existing };
      await uploadDraftArtworkWithRecovery(files, recoveryStore, uploadDeps);
      const result = await submitOrderWithRecovery(recoveryStore, orderDeps);
      let warnings = result.followUpWarnings;
      calls.accountSummary += 1;
      if (accountSummaryFails) {
        warnings = [...warnings, FOLLOW_UP_WARNINGS.accountSummary];
        recoveryStore.appendFollowUpWarnings([FOLLOW_UP_WARNINGS.accountSummary]);
      }
      return { receiptOnly: false, ...result, followUpWarnings: warnings };
    });
  }
  return { storage, calls, submit };
}

const files = () => [{ id: "d1", file: new File(["logo-bytes"], "logo.png", { type: "image/png" }) }];

test("save with warnings -> reopen same draft: original order and warnings, no extra upload or create", async () => {
  const h = harness({ createWarnings: [FOLLOW_UP_WARNINGS.notification, FOLLOW_UP_WARNINGS.processing] });
  const first = await h.submit(files());
  assert.deepEqual(first.followUpWarnings, [FOLLOW_UP_WARNINGS.notification, FOLLOW_UP_WARNINGS.processing]);
  const reopened = await h.submit([{ id: "d1", file: new File(["changed"], "logo.png", { type: "image/png" }) }]);
  assert.equal(reopened.receiptOnly, true);
  assert.equal(reopened.order.order_number, "TC-100");
  assert.deepEqual(reopened.followUpWarnings, [FOLLOW_UP_WARNINGS.notification, FOLLOW_UP_WARNINGS.processing]);
  assert.deepEqual(h.calls, { upload: 1, create: 1, accountSummary: 1, followUps: 1 });
  const view = buildSubmittedView({ receiptOnly: true, createdOrderNumber: reopened.order.order_number, followUpWarnings: reopened.followUpWarnings });
  assert.deepEqual(view.warnings, [FOLLOW_UP_WARNINGS.notification, FOLLOW_UP_WARNINGS.processing]);
});

test("account-summary warning appended after save persists and appears after reopen", async () => {
  const h = harness({ createWarnings: [FOLLOW_UP_WARNINGS.timeline], accountSummaryFails: true });
  const first = await h.submit(files());
  assert.deepEqual(first.followUpWarnings, [FOLLOW_UP_WARNINGS.timeline, FOLLOW_UP_WARNINGS.accountSummary]);
  const stored = JSON.parse(h.storage.map.get(recoveryStorageKey(binding)));
  assert.deepEqual(stored.order.followUpWarnings, [FOLLOW_UP_WARNINGS.timeline, FOLLOW_UP_WARNINGS.accountSummary]);
  const reopened = await h.submit(files());
  assert.equal(reopened.receiptOnly, true);
  assert.deepEqual(reopened.followUpWarnings, [FOLLOW_UP_WARNINGS.timeline, FOLLOW_UP_WARNINGS.accountSummary]);
  assert.equal(h.calls.create, 1);
  assert.equal(h.calls.upload, 1);
  assert.equal(h.calls.accountSummary, 1, "account summary is not rerun on reopen");
});

test("append dedupes and an older v3 receipt without followUpWarnings defaults to []", async () => {
  const storage = memoryStorage();
  const key = recoveryStorageKey(binding);
  storage.map.set(key, JSON.stringify({ version: 3, revision: 2, ...binding, submissionKey: "k", uploads: {},
    order: { status: "confirmed", submissionKey: "k", order: { order_number: "TC-OLD" }, artworkLink: { status: "linked" } } }));
  const existing = await reconcileExistingOrder(createRecoveryStore(storage, binding), {});
  assert.deepEqual(existing.followUpWarnings, []);
  const store = createRecoveryStore(storage, binding);
  store.appendFollowUpWarnings(["A", "A", " "]);
  assert.deepEqual(store.appendFollowUpWarnings(["A", "B"]), ["A", "B"]);
});

test("lost-create reconciled order: link unknown, no fabricated warnings, follow-ups not rerun", async () => {
  const storage = memoryStorage();
  let creates = 0;
  const result = await submitOrderWithRecovery(createRecoveryStore(storage, binding), {
    create: async () => { creates += 1; throw new Error("network lost"); },
    reconcileOrder: async () => ({ status: "found", order: { order_number: "TC-200" } }),
  });
  assert.equal(result.artworkLink.status, "unknown");
  assert.deepEqual(result.followUpWarnings, []);
  const reopened = await reconcileExistingOrder(createRecoveryStore(storage, binding), {});
  assert.deepEqual(reopened.followUpWarnings, []);
  assert.equal(reopened.artworkLink.status, "unknown");
  assert.equal(creates, 1);
});

for (const [label, value] of [["string", "oops"], ["object", { a: 1 }], ["array with empty string", ["ok", ""]], ["array with number", [1]]]) {
  test(`invalid followUpWarnings (${label}) -> blocked, bytes unchanged`, async () => {
    const storage = memoryStorage();
    const key = recoveryStorageKey(binding);
    const raw = JSON.stringify({ version: 3, revision: 1, ...binding, submissionKey: "k", uploads: {},
      order: { status: "confirmed", submissionKey: "k", order: { order_number: "TC-1" }, artworkLink: { status: "linked" }, followUpWarnings: value } });
    storage.map.set(key, raw);
    const store = createRecoveryStore(storage, binding);
    assert.equal(store.blocked, true);
    await assert.rejects(reconcileExistingOrder(store, {}), RecoveryStateError);
    assert.throws(() => store.appendFollowUpWarnings(["x"]), RecoveryStateError);
    assert.equal(storage.map.get(key), raw);
  });
}

test("append under a stale revision is refused and the receipt is unchanged", async () => {
  const storage = memoryStorage();
  const key = recoveryStorageKey(binding);
  const stale = createRecoveryStore(storage, binding);
  await submitOrderWithRecovery(createRecoveryStore(storage, binding), {
    create: async () => ({ order: { order_number: "TC-300" }, artworkLink: { status: "linked" }, followUpWarnings: ["W1"] }),
    reconcileOrder: async () => ({ status: "absent" }),
  });
  const before = storage.map.get(key);
  assert.throws(() => stale.appendFollowUpWarnings(["W2"]), RecoveryStateError);
  // A second up-to-date instance advances the revision; the first is now stale too.
  const a = createRecoveryStore(storage, binding);
  const b = createRecoveryStore(storage, binding);
  a.appendFollowUpWarnings(["W2"]);
  const afterA = storage.map.get(key);
  assert.throws(() => b.appendFollowUpWarnings(["W3"]), (e) => e instanceof RecoveryStateError && /another tab/.test(e.message));
  assert.equal(storage.map.get(key), afterA);
  assert.notEqual(before, afterA);
  assert.deepEqual(JSON.parse(afterA).order.followUpWarnings, ["W1", "W2"]);
});

test("append without a confirmed order is refused", () => {
  const store = createRecoveryStore(memoryStorage(), binding);
  assert.throws(() => store.appendFollowUpWarnings(["x"]), RecoveryStateError);
});
