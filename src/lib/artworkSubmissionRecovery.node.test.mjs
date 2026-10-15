// Run: node --test --test-concurrency=1 src/lib/artworkSubmissionRecovery.node.test.mjs
// Pure-logic tests with in-memory storage and scripted upload/order/read fakes.
// They do not exercise Supabase, RLS, storage policies, the RPC or React.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubmittedView } from "./orderSubmittedView.js";
import {
  buildRecoveryBinding,
  createRecoveryStore,
  reconcileExistingOrder,
  RecoveryBusyError,
  RecoveryStateError,
  recoveryStorageKey,
  submitOrderWithRecovery,
  UnresolvedSubmissionError,
  uploadDraftArtworkWithRecovery,
  withRecoveryLock,
} from "./artworkSubmissionRecovery.js";

function memoryStorage({ failSetAfter = Infinity } = {}) {
  const map = new Map();
  let sets = 0;
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      sets += 1;
      if (sets > failSetAfter) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
  };
}

const mkFile = (content, name, type = "image/png", lastModified = 1) =>
  new File([content], name, { type, lastModified });
const fileA = mkFile("AAAA-logo", "logo.png");
const fileB = mkFile("BBBB-back", "back.pdf", "application/pdf", 2);
const binding = { customerId: "cust-1", authUserId: "auth-1", draftId: "2026-10-15T10:00:00.000Z" };
let keyCounter = 0;
const keyFactory = () => `key-${++keyCounter}`;
const open = (storage, b = binding) => createRecoveryStore(storage, b, { keyFactory });

function uploadHarness(script) {
  const calls = { upload: [], reconcile: [] };
  let pathCounter = 0;
  const committed = new Map(); // storagePath -> artwork visible to reads
  const deps = {
    buildStoragePath: (asset) => `cust-1/p${++pathCounter}-${asset.file.name}`,
    upload: async (asset, { storagePath }) => {
      calls.upload.push({ id: asset.id, storagePath });
      const step = script.shift() || "ok";
      const artwork = { id: `art-${storagePath}` };
      if (step === "fail") throw new Error("upload failed");
      if (step === "lost-visible") {
        committed.set(storagePath, artwork);
        throw new Error("network lost");
      }
      if (step === "lost-delayed") throw new Error("network lost"); // commit lands later
      committed.set(storagePath, artwork);
      return artwork;
    },
    reconcileUpload: async (storagePath) => {
      calls.reconcile.push(storagePath);
      if (deps.readThrows) throw new Error("read failed");
      return committed.has(storagePath) ? { status: "found", artwork: committed.get(storagePath) } : { status: "absent" };
    },
  };
  return { deps, calls, committed };
}

function validState(overrides = {}) {
  return { version: 3, revision: 4, ...binding, submissionKey: "k", uploads: {}, order: null, ...overrides };
}

// Faithful in-memory exclusive lock manager (subset of navigator.locks).
function fakeLockManager() {
  const held = new Set();
  return {
    held,
    async request(name, options, callback) {
      assert.equal(options.mode, "exclusive");
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error("fake only supports ifAvailable");
      }
      held.add(name);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        held.delete(name);
      }
    },
  };
}

const assets = () => [
  { id: "d1", file: fileA },
  { id: "d2", file: fileB },
];

test("partial upload: uncertain failure stays unresolved; confirmed earlier upload is reused", async () => {
  const storage = memoryStorage();
  const { deps, calls } = uploadHarness(["ok", "fail"]);
  await assert.rejects(uploadDraftArtworkWithRecovery(assets(), open(storage), deps), UnresolvedSubmissionError);
  await assert.rejects(uploadDraftArtworkWithRecovery(assets(), open(storage), deps), UnresolvedSubmissionError);
  assert.deepEqual(calls.upload.map((c) => c.id), ["d1", "d2"], "no re-upload of d1 and no retry of d2");
  assert.equal(open(storage).getUpload("d1").status, "confirmed");
  assert.equal(open(storage).getUpload("d2").status, "pending");
});

test("delayed upload commit: empty lookup -> unresolved; later lookup finds it -> reused; never a second write", async () => {
  const storage = memoryStorage();
  const { deps, calls, committed } = uploadHarness(["lost-delayed"]);
  const one = [{ id: "d1", file: fileA }];
  await assert.rejects(uploadDraftArtworkWithRecovery(one, open(storage), deps), UnresolvedSubmissionError);
  await assert.rejects(uploadDraftArtworkWithRecovery(one, open(storage), deps), UnresolvedSubmissionError);
  committed.set(calls.upload[0].storagePath, { id: "art-late" });
  const results = await uploadDraftArtworkWithRecovery(one, open(storage), deps);
  assert.equal(results.get("d1").id, "art-late");
  assert.equal(calls.upload.length, 1);
  assert.deepEqual(calls.reconcile, Array(3).fill(calls.upload[0].storagePath));
});

test("lost upload response visible on immediate lookup is reused without re-upload", async () => {
  const storage = memoryStorage();
  const { deps, calls } = uploadHarness(["lost-visible", "ok"]);
  const results = await uploadDraftArtworkWithRecovery(assets(), open(storage), deps);
  assert.equal(calls.upload.length, 2);
  assert.equal(results.get("d1").id, "art-cust-1/p1-logo.png");
});

test("lookup read error after uncertain upload is unresolved", async () => {
  const storage = memoryStorage();
  const { deps, calls } = uploadHarness(["lost-delayed"]);
  deps.readThrows = true;
  await assert.rejects(
    uploadDraftArtworkWithRecovery([{ id: "d1", file: fileA }], open(storage), deps),
    (error) => error instanceof UnresolvedSubmissionError && /couldn't confirm/.test(error.message)
  );
  assert.equal(calls.upload.length, 1);
});

test("same name/size/lastModified/type but different contents -> new upload", async () => {
  const storage = memoryStorage();
  const { deps, calls } = uploadHarness(["ok", "ok"]);
  const v1 = mkFile("AAAA", "logo.png", "image/png", 5);
  const v2 = mkFile("ZZZZ", "logo.png", "image/png", 5);
  await uploadDraftArtworkWithRecovery([{ id: "d1", file: v1 }], open(storage), deps);
  const results = await uploadDraftArtworkWithRecovery([{ id: "d1", file: v2 }], open(storage), deps);
  assert.equal(calls.upload.length, 2);
  assert.notEqual(results.get("d1").id, "art-cust-1/p1-logo.png");
  // identical contents are reused
  await uploadDraftArtworkWithRecovery([{ id: "d1", file: mkFile("ZZZZ", "logo.png", "image/png", 5) }], open(storage), deps);
  assert.equal(calls.upload.length, 2);
});

for (const [label, changed] of [
  ["customer", { ...binding, customerId: "cust-2" }],
  ["auth user", { ...binding, authUserId: "auth-2" }],
  ["draft", { ...binding, draftId: "2026-10-15T11:00:00.000Z" }],
]) {
  test(`changed ${label}: no reuse, other identity's unresolved entry preserved and not exposed`, async () => {
    const storage = memoryStorage();
    const { deps, calls } = uploadHarness(["ok", "lost-delayed", "ok", "ok"]);
    await assert.rejects(uploadDraftArtworkWithRecovery(assets(), open(storage), deps), UnresolvedSubmissionError);
    const originalKey = recoveryStorageKey(binding);
    const before = storage.map.get(originalKey);

    const other = open(storage, changed);
    assert.deepEqual(other.snapshot().uploads, {});
    assert.equal(other.getOrder(), null);
    await uploadDraftArtworkWithRecovery(assets(), other, deps);
    assert.deepEqual(calls.upload.map((c) => c.id), ["d1", "d2", "d1", "d2"]);
    assert.equal(other.clear(), true);

    assert.notEqual(recoveryStorageKey(changed), originalKey);
    assert.equal(storage.map.get(originalKey), before, "original entry byte-identical");
    assert.equal(open(storage).getUpload("d2").status, "pending");
  });
}

for (const [label, storageFactory] of [
  ["throwing getItem", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ uploads: { d1: { status: "pending", storagePath: "cust-1/x", fingerprint: "f" } } }))), { ...seed, getItem: () => { throw new Error("SecurityError"); } })],
  ["bad JSON", (seed) => (seed.map.set(recoveryStorageKey(binding), "{not json"), seed)],
  ["wrong version", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ version: 2 }))), seed)],
  ["wrong shape", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ uploads: [] }))), seed)],
  ["order: {}", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ order: {} }))), seed)],
  ["invalid upload status", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ uploads: { d1: { status: "done", storagePath: "cust-1/x", fingerprint: "f" } } }))), seed)],
  ["confirmed upload missing artwork id", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ uploads: { d1: { status: "confirmed", storagePath: "cust-1/x", fingerprint: "f", artwork: {} } } }))), seed)],
  ["pending upload missing fingerprint", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ uploads: { d1: { status: "pending", storagePath: "cust-1/x" } } }))), seed)],
  ["confirmed order missing number", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ order: { status: "confirmed", submissionKey: "k", order: {}, artworkLink: { status: "linked" } } }))), seed)],
  ["pending order missing submission key", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ order: { status: "pending" } }))), seed)],
  ["missing revision", (seed) => (seed.map.set(recoveryStorageKey(binding), JSON.stringify(validState({ revision: undefined }))), seed)],
]) {
  test(`corrupted storage (${label}) blocks writes and preserves state byte-identical`, async () => {
    const seed = memoryStorage();
    const storage = storageFactory(seed);
    const key = recoveryStorageKey(binding);
    const before = seed.map.get(key);
    assert.equal(typeof before, "string");
    const store = open(storage);
    assert.equal(store.blocked, true);
    const { deps, calls } = uploadHarness([]);
    await assert.rejects(uploadDraftArtworkWithRecovery(assets(), store, deps), RecoveryStateError);
    const order = orderHarness([], () => ({ status: "absent" }));
    await assert.rejects(submitOrderWithRecovery(store, order.deps), RecoveryStateError);
    assert.equal(store.clear(), false);
    assert.equal(calls.upload.length, 0);
    assert.equal(order.calls.create.length, 0);
    assert.equal(seed.map.get(key), before);
  });
}

test("failed recovery-state persistence is surfaced before any upload", async () => {
  const storage = memoryStorage({ failSetAfter: 0 });
  const { deps, calls } = uploadHarness([]);
  await assert.rejects(
    uploadDraftArtworkWithRecovery(assets(), open(storage), deps),
    (error) => error instanceof RecoveryStateError && /couldn't save/.test(error.message)
  );
  assert.equal(calls.upload.length, 0);
});

test("failed persistence of a confirmed receipt is surfaced, not assumed saved", async () => {
  const storage = memoryStorage({ failSetAfter: 1 });
  const { deps } = uploadHarness(["ok"]);
  await assert.rejects(uploadDraftArtworkWithRecovery([{ id: "d1", file: fileA }], open(storage), deps), RecoveryStateError);
});

test("storage setItem returning false is treated as failure", async () => {
  const storage = { ...memoryStorage(), setItem: () => false };
  const { deps } = uploadHarness([]);
  await assert.rejects(uploadDraftArtworkWithRecovery([{ id: "d1", file: fileA }], open(storage), deps), RecoveryStateError);
});

test("missing binding details refuse to build a recovery record", () => {
  assert.throws(() => buildRecoveryBinding({ customerId: "c", authUserId: "", draftId: "d" }), RecoveryStateError);
  assert.deepEqual(buildRecoveryBinding({ customerId: " c ", authUserId: "a", draftId: "d" }), {
    customerId: "c",
    authUserId: "a",
    draftId: "d",
  });
});

function orderHarness(script, reconcile) {
  const calls = { create: [], reconcile: [] };
  return {
    calls,
    deps: {
      create: async (key) => {
        calls.create.push(key);
        const step = script.shift() || "ok";
        if (step === "lost") throw new Error("network lost");
        if (step === "link-failed") {
          return { order: { order_number: "TC-000001" }, artworkLink: { status: "failed" } };
        }
        return { order: { order_number: "TC-000001" }, artworkLink: { status: "linked" } };
      },
      reconcileOrder: async (key) => {
        calls.reconcile.push(key);
        return reconcile(key);
      },
    },
  };
}

test("lost order response found on lookup: reused, link status unknown, no second create", async () => {
  const storage = memoryStorage();
  keyCounter = 100;
  const { deps, calls } = orderHarness(["lost"], () => ({ status: "found", order: { order_number: "TC-123456" } }));
  const result = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(result.order.order_number, "TC-123456");
  assert.equal(result.artworkLink.status, "unknown");
  const again = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(again.order.order_number, "TC-123456");
  assert.equal(again.artworkLink.status, "unknown");
  assert.deepEqual(calls.create, ["key-101"]);
});

test("delayed order commit: empty lookup -> unresolved; later lookup finds it -> reused; never a second create", async () => {
  const storage = memoryStorage();
  keyCounter = 200;
  let landed = false;
  const { deps, calls } = orderHarness(["lost"], () =>
    landed ? { status: "found", order: { order_number: "TC-777777" } } : { status: "absent" }
  );
  await assert.rejects(
    submitOrderWithRecovery(open(storage), deps),
    (error) => error instanceof UnresolvedSubmissionError && /don't resubmit/.test(error.message)
  );
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), UnresolvedSubmissionError);
  landed = true;
  const result = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(result.order.order_number, "TC-777777");
  assert.equal(result.artworkLink.status, "unknown");
  assert.deepEqual(calls.create, ["key-201"]);
  assert.deepEqual(calls.reconcile, ["key-201", "key-201", "key-201"]);
});

test("order lookup read error after lost response is unresolved", async () => {
  const storage = memoryStorage();
  const { deps, calls } = orderHarness(["lost"], () => {
    throw new Error("select denied");
  });
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), UnresolvedSubmissionError);
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), UnresolvedSubmissionError);
  assert.equal(calls.create.length, 1);
});

test("post-save artwork link failure keeps the order and reports status failed", async () => {
  const storage = memoryStorage();
  const { deps, calls } = orderHarness(["link-failed"], () => ({ status: "absent" }));
  const result = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(result.order.order_number, "TC-000001");
  assert.equal(result.artworkLink.status, "failed");
  const retry = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(retry.reused, true);
  assert.equal(retry.artworkLink.status, "failed");
  assert.equal(calls.create.length, 1);
});

test("failed draft cleanup: saved-order evidence keeps the order confirmed; retry shows it, no second create", async () => {
  const storage = memoryStorage();
  keyCounter = 400;
  const { deps, calls } = orderHarness(["ok"], () => ({ status: "absent" }));
  const store = open(storage);
  await submitOrderWithRecovery(store, deps);
  // Draft cleanup fails, so the caller does not clear the recovery record.
  const retryStore = open(storage);
  const saved = retryStore.getOrder();
  assert.deepEqual(saved, {
    status: "confirmed",
    submissionKey: "key-401",
    order: { order_number: "TC-000001" },
    artworkLink: { status: "linked" },
  });
  const retry = await submitOrderWithRecovery(retryStore, deps);
  assert.equal(retry.order.order_number, "TC-000001");
  assert.equal(retry.reused, true);
  assert.equal(calls.create.length, 1);
});

test("failed saved-order evidence write is surfaced while the order is still confirmed", async () => {
  const storage = memoryStorage({ failSetAfter: 1 }); // pending marker ok, evidence write fails
  const { deps, calls } = orderHarness(["ok"], () => ({ status: "found", order: { order_number: "TC-000001" } }));
  const result = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(result.order.order_number, "TC-000001");
  assert.ok(result.evidenceError instanceof RecoveryStateError);
  assert.equal(result.reused, false);
  assert.equal(calls.create.length, 1);
  // The pending marker remains; a retry reconciles instead of creating again.
  const retry = await submitOrderWithRecovery(open(storage), deps);
  assert.equal(retry.order.order_number, "TC-000001");
  assert.equal(calls.create.length, 1);
});

test("order create refuses to start when the pending marker cannot be saved", async () => {
  const storage = memoryStorage({ failSetAfter: 0 });
  const { deps, calls } = orderHarness([], () => ({ status: "absent" }));
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), RecoveryStateError);
  assert.equal(calls.create.length, 0);
});

test("clear() refuses to remove a record that still holds unresolved entries", async () => {
  const storage = memoryStorage();
  const { deps } = orderHarness(["lost"], () => ({ status: "absent" }));
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), UnresolvedSubmissionError);
  assert.equal(open(storage).clear(), false);
  assert.equal(open(storage).getOrder().status, "pending");
});

test("two concurrent instances submitting the same draft: only one write path proceeds", async () => {
  const storage = memoryStorage();
  const locks = fakeLockManager();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { deps, calls } = orderHarness(["ok", "ok"], () => ({ status: "absent" }));
  const slowDeps = { ...deps, create: async (key) => { await gate; return deps.create(key); } };
  const first = withRecoveryLock(locks, binding, () => submitOrderWithRecovery(open(storage), slowDeps));
  const second = withRecoveryLock(locks, binding, () => submitOrderWithRecovery(open(storage), deps));
  await assert.rejects(second, RecoveryBusyError);
  release();
  const result = await first;
  assert.equal(result.order.order_number, "TC-000001");
  assert.equal(calls.create.length, 1);
  assert.equal(locks.held.size, 0);
  // A different draft is not blocked by this lock.
  const other = await withRecoveryLock(locks, { ...binding, draftId: "other" }, async () => "ran");
  assert.equal(other, "ran");
});

test("stale instance write/clear after another instance advanced the revision is refused; evidence unchanged", async () => {
  const storage = memoryStorage();
  const key = recoveryStorageKey(binding);
  const stale = open(storage);
  const fresh = open(storage);
  const { deps, calls } = orderHarness(["ok", "ok"], () => ({ status: "absent" }));
  await submitOrderWithRecovery(fresh, deps);
  const evidence = storage.map.get(key);
  assert.throws(
    () => stale.setUpload("d9", { status: "pending", storagePath: "cust-1/z", fingerprint: "f" }),
    (error) => error instanceof RecoveryStateError && /another tab/.test(error.message)
  );
  assert.throws(() => stale.setOrder({ status: "pending", submissionKey: "x" }), RecoveryStateError);
  assert.equal(stale.clear(), false);
  assert.equal(storage.map.get(key), evidence);
  assert.equal(calls.create.length, 1);
  assert.equal(JSON.parse(evidence).revision, 2);
});

test("Web Locks unavailable: submission refused, nothing runs", async () => {
  let ran = false;
  for (const manager of [null, undefined, {}]) {
    await assert.rejects(
      withRecoveryLock(manager, binding, async () => { ran = true; }),
      (error) => error instanceof RecoveryStateError && /Web Locks unavailable/.test(error.message)
    );
  }
  assert.equal(ran, false);
});

test("pending order + changed artwork: order reconciled first, zero uploads", async () => {
  const storage = memoryStorage();
  const { deps: orderDeps } = orderHarness(["lost"], () => ({ status: "absent" }));
  await assert.rejects(submitOrderWithRecovery(open(storage), orderDeps), UnresolvedSubmissionError);
  const { deps, calls } = uploadHarness([]);
  const changed = [{ id: "d1", file: mkFile("NEW-CONTENT", "new.png") }];

  // unresolved lookup: stop before uploads
  const store = open(storage);
  await assert.rejects(reconcileExistingOrder(store, orderDeps), UnresolvedSubmissionError);
  await assert.rejects(uploadDraftArtworkWithRecovery(changed, open(storage), deps), UnresolvedSubmissionError);
  assert.equal(calls.upload.length, 0);

  // later found: receipt confirmation, still no uploads
  const found = await reconcileExistingOrder(open(storage), {
    reconcileOrder: async () => ({ status: "found", order: { order_number: "TC-424242" } }),
  });
  assert.equal(found.order.order_number, "TC-424242");
  assert.equal(found.artworkLink.status, "unknown");
  await assert.rejects(uploadDraftArtworkWithRecovery(changed, open(storage), deps), UnresolvedSubmissionError);
  assert.equal(calls.upload.length, 0);
});

test("reconciled order without an order number stays unresolved", async () => {
  const storage = memoryStorage();
  const { deps } = orderHarness(["lost"], () => ({ status: "found", order: {} }));
  await assert.rejects(submitOrderWithRecovery(open(storage), deps), UnresolvedSubmissionError);
  assert.equal(open(storage).getOrder().status, "pending");
});

// Mirrors the order screen's flow: lock -> reconcile existing order first ->
// uploads -> order. Returns { receiptOnly, result }.
async function submitDraft({ storage, locks, store, files, uploadDeps, orderDeps }) {
  return withRecoveryLock(locks, binding, async () => {
    const recoveryStore = store || open(storage);
    const existing = await reconcileExistingOrder(recoveryStore, orderDeps);
    if (existing) return { receiptOnly: true, result: existing };
    await uploadDraftArtworkWithRecovery(files, recoveryStore, uploadDeps);
    const result = await submitOrderWithRecovery(recoveryStore, orderDeps);
    return { receiptOnly: result.reused, result };
  });
}

function sequentialHarness() {
  const storage = memoryStorage();
  const locks = fakeLockManager();
  const upload = uploadHarness(["ok", "ok", "ok", "ok"]);
  const order = orderHarness(["ok", "ok", "ok"], () => ({ status: "absent" }));
  return { storage, locks, upload, order, run: (opts) => submitDraft({ storage, locks, uploadDeps: upload.deps, orderDeps: order.deps, ...opts }) };
}

test("(a) evidence survives successful cleanup: same-instance resubmit returns original order, no upload/create", async () => {
  const h = sequentialHarness();
  const store = open(h.storage);
  const first = await h.run({ store, files: assets() });
  assert.equal(first.receiptOnly, false);
  assert.equal(store.clear(), false, "confirmed-order evidence is never cleared");
  const again = await h.run({ store, files: assets() });
  assert.equal(again.receiptOnly, true);
  assert.equal(again.result.order.order_number, "TC-000001");
  assert.equal(h.upload.calls.upload.length, 2);
  assert.equal(h.order.calls.create.length, 1);
  assert.equal(open(h.storage).getOrder().status, "confirmed");
});

test("(b) stale tab/store created before submission, run after first completes -> original order", async () => {
  const h = sequentialHarness();
  const staleStore = open(h.storage); // opened before the first submission
  await h.run({ files: assets() });
  const stale = await h.run({ store: staleStore, files: assets() });
  assert.equal(stale.receiptOnly, true);
  assert.equal(stale.result.order.order_number, "TC-000001");
  assert.equal(h.upload.calls.upload.length, 2);
  assert.equal(h.order.calls.create.length, 1);
});

test("(c) stale tab with changed artwork contents after the order -> original order, zero uploads", async () => {
  const h = sequentialHarness();
  const staleStore = open(h.storage);
  await h.run({ files: assets() });
  const changed = [
    { id: "d1", file: mkFile("CHANGED-1", "logo.png") },
    { id: "d3", file: mkFile("BRAND-NEW", "extra.png") },
  ];
  for (const store of [staleStore, open(h.storage)]) {
    const result = await h.run({ store, files: changed });
    assert.equal(result.receiptOnly, true);
    assert.equal(result.result.order.order_number, "TC-000001");
  }
  assert.equal(h.upload.calls.upload.length, 2);
  assert.equal(h.order.calls.create.length, 1);
});

test("(d) stale store holding old revision: direct write/clear refused, evidence intact, then reload shows order", async () => {
  const h = sequentialHarness();
  const key = recoveryStorageKey(binding);
  const staleStore = open(h.storage);
  await h.run({ files: assets() });
  const evidence = h.storage.map.get(key);
  assert.throws(() => staleStore.setUpload("d1", { status: "pending", storagePath: "cust-1/q", fingerprint: "f" }), RecoveryStateError);
  assert.throws(() => staleStore.setOrder(null), RecoveryStateError);
  assert.equal(staleStore.clear(), false);
  assert.equal(h.storage.map.get(key), evidence);
  const result = await h.run({ store: staleStore, files: assets() });
  assert.equal(result.result.order.order_number, "TC-000001");
  assert.equal(h.storage.map.get(key), evidence, "reading the receipt does not rewrite evidence");
});

test("(e) resubmitted order uses the receipt-only view without draft values", async () => {
  const h = sequentialHarness();
  await h.run({ files: assets() });
  const { result } = await h.run({ files: [{ id: "d1", file: mkFile("CHANGED", "logo.png") }] });
  const view = buildSubmittedView({
    receiptOnly: true,
    createdOrderNumber: result.order.order_number,
    artworkLinkWarning: "",
    garmentName: "Draft Hoodie",
    notes: "unsaved notes",
  });
  assert.deepEqual(view, { mode: "receipt", orderNumber: "TC-000001", warnings: [], myOrdersPath: "/portal/orders" });
});
