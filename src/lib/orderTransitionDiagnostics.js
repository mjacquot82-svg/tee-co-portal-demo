const STORAGE_KEY = "teeCoOrderTransitionDiagnostics";
const DATABASE_NAME = "teeCoTemporaryDiagnostics";
const DATABASE_VERSION = 1;
const STORE_NAME = "orderTransitionEvents";

function mergeDiagnostics(...collections) {
  const byId = new Map();

  collections.flat().forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id =
      entry.diagnostic_id ||
      `${entry.recorded_at || ""}:${entry.stage || ""}:${entry.order_number || ""}`;
    byId.set(id, { ...entry, diagnostic_id: id });
  });

  return [...byId.values()]
    .sort((left, right) => String(left.recorded_at).localeCompare(String(right.recorded_at)))
    .slice(-500);
}

function readLegacyDiagnostics() {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function openDiagnosticsDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("Unable to open diagnostics database"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "diagnostic_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runDiagnosticsTransaction(mode, operation) {
  const database = await openDiagnosticsDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);
      request.onerror = () => reject(request.error || new Error("Diagnostics transaction failed"));
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    database.close();
  }
}

function persistDiagnostic(entry) {
  return runDiagnosticsTransaction("readwrite", (store) => store.put(entry)).catch(() => {
    // Diagnostics must never affect the order workflow.
  });
}

export function recordOrderTransitionDiagnostic(stage, details = {}) {
  const entry = {
    diagnostic_id: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    stage,
    ...details,
    recorded_at: new Date().toISOString(),
    capture_transport: "indexedDB",
  };

  if (typeof window === "undefined") return entry;

  const current = Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)
    ? window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__
    : [];
  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = mergeDiagnostics(current, [entry]);

  // IndexedDB has a separate, substantially larger quota than the order snapshot in
  // localStorage. Do not await this temporary diagnostic write from business logic.
  void persistDiagnostic(entry);

  return entry;
}

export async function restoreOrderTransitionDiagnostics() {
  if (typeof window === "undefined") return [];
  const current = Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)
    ? window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__
    : [];
  let persisted = [];

  try {
    persisted = await runDiagnosticsTransaction("readonly", (store) => store.getAll());
  } catch {
    // Retain in-memory and legacy diagnostics if IndexedDB is unavailable.
  }

  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = mergeDiagnostics(
    readLegacyDiagnostics(),
    current,
    persisted
  );

  return window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__;
}

export async function clearOrderTransitionDiagnostics() {
  if (typeof window === "undefined") return;
  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
  window.localStorage.removeItem(STORAGE_KEY);

  try {
    await runDiagnosticsTransaction("readwrite", (store) => store.clear());
  } catch {
    // Clearing temporary diagnostics is best-effort.
  }
}
