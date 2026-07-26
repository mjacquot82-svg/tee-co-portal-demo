const STORAGE_KEY = "teeCoOrderTransitionDiagnostics";

function readStoredDiagnostics() {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

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

export function recordOrderTransitionDiagnostic(stage, details = {}) {
  const entry = {
    diagnostic_id: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    stage,
    ...details,
    recorded_at: new Date().toISOString(),
  };

  if (typeof window === "undefined") return entry;

  const current = Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)
    ? window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__
    : [];
  const next = mergeDiagnostics(readStoredDiagnostics(), current, [entry]);
  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = next;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Temporary diagnostics are best-effort and must not affect the workflow.
  }

  return entry;
}

export function restoreOrderTransitionDiagnostics() {
  if (typeof window === "undefined") return [];
  const current = Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)
    ? window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__
    : [];
  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = mergeDiagnostics(
    readStoredDiagnostics(),
    current
  );

  return window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__;
}

restoreOrderTransitionDiagnostics();
