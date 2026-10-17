// Customer artwork submission recovery.
//
// Keeps a small receipt per (auth user, customer, draft) in browser storage so a
// retried submission can reuse confirmed uploads/orders and never repeats a
// write whose outcome is uncertain. After any uncertain write, an empty lookup
// stays UNRESOLVED (a delayed commit could still land); there is no
// server-side replay protection, so we never retry such a write.
// Dependencies (storage, locks, upload, reads) are injected so this module stays pure.
//
// Coordination: every submission runs inside an exclusive Web Lock
// (navigator.locks) named per identity+draft, and every write/clear is a
// compare-and-set on a revision counter re-read from storage. This only
// coordinates tabs/windows of ONE browser profile on ONE device. It is not
// cross-device or server-side idempotency: another device, browser or a
// cleared profile can still submit the same draft independently.

export const RECOVERY_STORAGE_PREFIX = "teeCoArtworkSubmissionRecovery:v3:";
export const RECOVERY_LOCK_PREFIX = "teeCoArtworkSubmissionLock:v3:";
const RECOVERY_VERSION = 3;
const UPLOAD_STATUSES = new Set(["pending", "confirmed"]);
const LINK_STATUSES = new Set(["linked", "failed", "unknown", "skipped"]);

export class RecoveryStateError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "RecoveryStateError";
    this.cause = cause;
  }
}

export class RecoveryBusyError extends Error {
  constructor(message = "This order is already being submitted in another tab or window. Please wait for it to finish, then check My Orders.") {
    super(message);
    this.name = "RecoveryBusyError";
  }
}

export class UnresolvedSubmissionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "UnresolvedSubmissionError";
    this.details = details;
  }
}

const UNREADABLE_MESSAGE =
  "We couldn't read this order's saved retry record in your browser, so we stopped before sending anything. Please contact Tee & Co. rather than resubmitting.";
const UNSAVABLE_MESSAGE =
  "We couldn't save this order's retry record in your browser, so we stopped before sending anything else. Free up browser storage or try another browser.";
const UPLOAD_UNRESOLVED = (name) =>
  `We couldn't confirm whether "${name || "your artwork"}" finished uploading. Please don't resubmit; contact Tee & Co. or try again later.`;
const ORDER_UNRESOLVED =
  "We couldn't confirm whether your order request was saved. Please don't resubmit; check My Orders shortly or contact Tee & Co.";

function text(value) {
  return String(value ?? "").trim();
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Content identity: SHA-256 of the bytes plus size and type (Web Crypto).
export async function fileFingerprint(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !globalThis.crypto?.subtle) {
    throw new RecoveryStateError("We couldn't verify this artwork file, so we stopped before uploading it.");
  }
  // Copy into this realm's Uint8Array: some runtimes (e.g. jsdom File + Node
  // Web Crypto) hand back a cross-realm ArrayBuffer that digest() rejects.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${toHex(digest)}:${Number(file.size ?? 0) || 0}:${text(file.type)}`;
}

export function buildRecoveryBinding({ customerId, authUserId, draftId }) {
  const binding = {
    customerId: text(customerId),
    authUserId: text(authUserId),
    draftId: text(draftId),
  };
  if (!binding.customerId || !binding.authUserId || !binding.draftId) {
    throw new RecoveryStateError(
      "We couldn't prepare a safe retry record for this order (missing account or draft details)."
    );
  }
  return binding;
}

// Scoped by auth user + customer + draft: one identity never reads, reuses,
// clears or reveals another identity's receipts.
export function recoveryStorageKey(binding) {
  return `${RECOVERY_STORAGE_PREFIX}${[binding.authUserId, binding.customerId, binding.draftId]
    .map(encodeURIComponent)
    .join(":")}`;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidUploadReceipt(receipt) {
  if (!isPlainObject(receipt) || !UPLOAD_STATUSES.has(receipt.status)) return false;
  if (!nonEmptyString(receipt.storagePath) || !nonEmptyString(receipt.fingerprint)) return false;
  if (receipt.status === "confirmed") {
    return isPlainObject(receipt.artwork) && nonEmptyString(String(receipt.artwork.id ?? ""));
  }
  return true;
}

function isValidOrderReceipt(order) {
  if (order === null) return true;
  if (!isPlainObject(order) || !nonEmptyString(order.submissionKey)) return false;
  if (order.status === "pending") return true;
  if (order.status !== "confirmed") return false;
  return (
    isPlainObject(order.order) &&
    nonEmptyString(order.order.order_number) &&
    isPlainObject(order.artworkLink) &&
    LINK_STATUSES.has(order.artworkLink.status) &&
    // Optional (older v3 records lack it and default to []); if present it
    // must be an array of non-empty strings.
    (order.followUpWarnings === undefined ||
      (Array.isArray(order.followUpWarnings) && order.followUpWarnings.every(nonEmptyString)))
  );
}

function normalizeWarnings(warnings) {
  return Array.from(new Set((Array.isArray(warnings) ? warnings : []).filter(nonEmptyString).map((w) => w.trim())));
}

function isValidState(state, binding) {
  return (
    isPlainObject(state) &&
    state.version === RECOVERY_VERSION &&
    Number.isInteger(state.revision) &&
    state.revision >= 0 &&
    state.customerId === binding.customerId &&
    state.authUserId === binding.authUserId &&
    state.draftId === binding.draftId &&
    nonEmptyString(state.submissionKey) &&
    isPlainObject(state.uploads) &&
    Object.values(state.uploads).every(isValidUploadReceipt) &&
    isValidOrderReceipt(state.order)
  );
}

export function recoveryLockName(binding) {
  return `${RECOVERY_LOCK_PREFIX}${[binding.authUserId, binding.customerId, binding.draftId]
    .map(encodeURIComponent)
    .join(":")}`;
}

// Runs fn while holding an exclusive Web Lock for this identity+draft.
// lockManager is navigator.locks (or a faithful fake in tests). If it is
// missing we refuse rather than emulate a lock with storage flags.
// If another holder has the lock we refuse immediately (ifAvailable).
export async function withRecoveryLock(lockManager, binding, fn) {
  if (!lockManager || typeof lockManager.request !== "function") {
    throw new RecoveryStateError(
      "This browser can't safely coordinate order submissions (Web Locks unavailable). Please use an up-to-date browser, or contact Tee & Co."
    );
  }
  return lockManager.request(
    recoveryLockName(binding),
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) throw new RecoveryBusyError();
      return fn();
    }
  );
}

function defaultKeyFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// storage: an object with getItem/setItem/removeItem (e.g. window.localStorage).
// An unreadable, unparsable or mis-shaped record is never reset or overwritten:
// the store is returned "blocked" and every write throws.
export function createRecoveryStore(storage, binding, { keyFactory = defaultKeyFactory } = {}) {
  if (!storage) {
    throw new RecoveryStateError("Browser storage is unavailable, so this order can't be safely retried.");
  }
  const key = recoveryStorageKey(binding);

  let state = null;
  let blockedReason = null;
  let storedRevision = null; // revision on disk when loaded; null = no record yet
  const freshSubmissionKey = keyFactory();

  // (Re)load from storage. Entry points call this inside the lock so a stale
  // tab or a store created before another submission sees the latest record.
  function load() {
    state = null;
    blockedReason = null;
    storedRevision = null;
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) {
        state = {
          version: RECOVERY_VERSION,
          revision: 0,
          ...binding,
          submissionKey: freshSubmissionKey,
          uploads: {},
          order: null,
        };
      } else {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed, binding)) {
          state = parsed;
          storedRevision = parsed.revision;
        } else blockedReason = "invalid";
      }
    } catch (error) {
      blockedReason = error;
    }
  }
  load();

  function assertWritable() {
    if (blockedReason) throw new RecoveryStateError(UNREADABLE_MESSAGE, blockedReason);
  }

  // Compare-and-set: refuse if the stored record changed since this instance loaded it.
  function assertNotStale() {
    let current;
    try {
      const raw = storage.getItem(key);
      current = raw === null || raw === undefined ? null : JSON.parse(raw);
    } catch (error) {
      throw new RecoveryStateError(UNREADABLE_MESSAGE, error);
    }
    const currentRevision = current === null ? null : current?.revision;
    if (currentRevision !== storedRevision) {
      throw new RecoveryStateError(
        "This order was updated from another tab or window. Reload this page before continuing; nothing else was sent."
      );
    }
  }

  function persist() {
    assertWritable();
    assertNotStale();
    const next = { ...state, revision: (storedRevision ?? 0) + 1 };
    let ok;
    try {
      ok = storage.setItem(key, JSON.stringify(next));
    } catch (error) {
      throw new RecoveryStateError(UNSAVABLE_MESSAGE, error);
    }
    if (ok === false) throw new RecoveryStateError(UNSAVABLE_MESSAGE);
    state = next;
    storedRevision = next.revision;
  }

  return {
    reload: load,
    get blocked() {
      return Boolean(blockedReason);
    },
    assertWritable,
    get submissionKey() {
      assertWritable();
      return state.submissionKey;
    },
    getUpload(assetId) {
      assertWritable();
      return state.uploads[assetId] || null;
    },
    setUpload(assetId, receipt) {
      assertWritable();
      state.uploads[assetId] = receipt;
      persist();
    },
    getOrder() {
      assertWritable();
      return state.order;
    },
    setOrder(order) {
      assertWritable();
      state.order = order;
      persist();
    },
    // Adds post-save follow-up warnings to the confirmed-order receipt.
    // Call inside the recovery lock; the revision compare-and-set refuses a
    // stale instance. Throws RecoveryStateError if it can't be recorded.
    appendFollowUpWarnings(warnings) {
      assertWritable();
      if (state.order?.status !== "confirmed") {
        throw new RecoveryStateError("There is no saved order receipt to update in this browser.");
      }
      const previous = state.order;
      state.order = {
        ...previous,
        followUpWarnings: normalizeWarnings([...(previous.followUpWarnings || []), ...normalizeWarnings(warnings)]),
      };
      try {
        persist();
      } catch (error) {
        state.order = previous;
        throw error;
      }
      return state.order.followUpWarnings;
    },
    // Only removes this identity's own record, and only when it holds no
    // unresolved (pending) entries.
    clear() {
      if (blockedReason) return false;
      // Confirmed-order evidence is kept permanently for this identity+draft.
      if (state.order?.status === "confirmed") return false;
      const hasPending =
        state.order?.status === "pending" ||
        Object.values(state.uploads).some((receipt) => receipt?.status === "pending");
      if (hasPending) return false;
      try {
        assertNotStale();
      } catch {
        return false;
      }
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    snapshot() {
      assertWritable();
      return JSON.parse(JSON.stringify(state));
    },
  };
}

async function safeReconcile(reconcile, ref) {
  try {
    const outcome = await reconcile(ref);
    if (outcome?.status === "found") return outcome;
    return { status: "not-found" };
  } catch {
    return { status: "not-found" };
  }
}

// deps.upload(asset, { storagePath }) -> artwork row (throws on failure/lost response)
// deps.reconcileUpload(storagePath) -> { status: "found", artwork } | anything else = not confirmed
// deps.buildStoragePath(asset) -> new storage path (only used for clean starts)
export async function uploadDraftArtworkWithRecovery(assets, store, deps) {
  store.reload();
  store.assertWritable();
  if (store.getOrder()) {
    // An order (pending or saved) exists for this draft: reconcile it first.
    throw new UnresolvedSubmissionError(ORDER_UNRESOLVED);
  }
  const results = new Map();
  for (const asset of assets) {
    const fingerprint = await fileFingerprint(asset.file);
    const receipt = store.getUpload(asset.id);

    if (receipt?.status === "pending") {
      // Uncertain earlier write: only a positive lookup resolves it.
      const outcome = await safeReconcile(deps.reconcileUpload, receipt.storagePath);
      if (outcome.status !== "found") {
        throw new UnresolvedSubmissionError(UPLOAD_UNRESOLVED(asset.file?.name), { assetId: asset.id });
      }
      store.setUpload(asset.id, { ...receipt, status: "confirmed", artwork: outcome.artwork });
      if (receipt.fingerprint === fingerprint) {
        results.set(asset.id, outcome.artwork);
        continue;
      }
      // The resolved upload was a different file; fall through to upload this one.
    } else if (receipt?.status === "confirmed" && receipt.fingerprint === fingerprint && receipt.artwork) {
      results.set(asset.id, receipt.artwork);
      continue;
    }

    const storagePath = deps.buildStoragePath(asset);
    // Record intent before the call so a lost response stays reconcilable.
    store.setUpload(asset.id, { status: "pending", fingerprint, storagePath });

    let artwork;
    try {
      artwork = await deps.upload(asset, { storagePath });
    } catch (error) {
      const outcome = await safeReconcile(deps.reconcileUpload, storagePath);
      if (outcome.status !== "found") {
        throw new UnresolvedSubmissionError(UPLOAD_UNRESOLVED(asset.file?.name), {
          assetId: asset.id,
          cause: error,
        });
      }
      artwork = outcome.artwork;
    }
    store.setUpload(asset.id, { status: "confirmed", fingerprint, storagePath, artwork });
    results.set(asset.id, artwork);
  }
  return results;
}

function minimalOrder(order) {
  return { order_number: text(order?.order_number) };
}

// Must run BEFORE any upload. Returns null when there is no order marker;
// returns the confirmed/reconciled order when one exists; throws
// UnresolvedSubmissionError when a pending order can't be confirmed.
export async function reconcileExistingOrder(store, deps) {
  store.reload();
  store.assertWritable();
  const existing = store.getOrder();
  if (!existing) return null;
  if (existing.status === "confirmed") {
    return {
      order: existing.order,
      artworkLink: existing.artworkLink,
      followUpWarnings: normalizeWarnings(existing.followUpWarnings),
      reused: true,
    };
  }
  const outcome = await safeReconcile(deps.reconcileOrder, existing.submissionKey);
  if (outcome.status !== "found") throw new UnresolvedSubmissionError(ORDER_UNRESOLVED);
  return confirmOrder(store, outcome.order, { status: "unknown" }, true);
}

// deps.create(submissionKey) -> { order, artworkLink? } (throws on failure/lost response)
// deps.reconcileOrder(submissionKey) -> { status: "found", order } | anything else = not confirmed
// Returns { order, artworkLink: {status}, reused, evidenceError? }.
export async function submitOrderWithRecovery(store, deps) {
  const existing = await reconcileExistingOrder(store, deps);
  if (existing) return existing;

  const submissionKey = store.submissionKey;
  store.setOrder({ status: "pending", submissionKey });
  let result;
  try {
    result = await deps.create(submissionKey);
  } catch (error) {
    const outcome = await safeReconcile(deps.reconcileOrder, submissionKey);
    if (outcome.status !== "found") {
      throw new UnresolvedSubmissionError(ORDER_UNRESOLVED, { cause: error });
    }
    return confirmOrder(store, outcome.order, { status: "unknown" }, true);
  }
  return confirmOrder(store, result.order, result.artworkLink || { status: "skipped" }, false, result.followUpWarnings);
}

// followUpWarnings are only known for a fresh create; a reconciled order never
// fabricates them (and follow-ups are never rerun to reconstruct them).
function confirmOrder(store, order, artworkLink, reused, followUpWarnings = []) {
  if (!nonEmptyString(order?.order_number)) {
    throw new UnresolvedSubmissionError(ORDER_UNRESOLVED);
  }
  const warnings = normalizeWarnings(followUpWarnings);
  const response = { order, artworkLink, reused, followUpWarnings: warnings };
  try {
    store.setOrder({
      status: "confirmed",
      submissionKey: store.submissionKey,
      order: minimalOrder(order),
      artworkLink: { status: LINK_STATUSES.has(artworkLink?.status) ? artworkLink.status : "unknown" },
      followUpWarnings: warnings,
    });
  } catch (error) {
    // The order exists; report that the browser couldn't record it.
    response.evidenceError = error;
  }
  return response;
}

// Adds the client submission key to an order payload without replacing any
// other order fields or existing order_metadata keys.
export function withClientSubmissionKey(orderPayload, submissionKey) {
  const metadata =
    orderPayload?.order_metadata && typeof orderPayload.order_metadata === "object" && !Array.isArray(orderPayload.order_metadata)
      ? orderPayload.order_metadata
      : {};
  return { ...orderPayload, order_metadata: { ...metadata, client_submission_key: submissionKey } };
}
