const STORAGE_KEY = "teeCoOrderTransitionDiagnostics";

export function recordOrderTransitionDiagnostic(stage, details = {}) {
  const entry = {
    stage,
    ...details,
    recorded_at: new Date().toISOString(),
  };

  console.info("[order-transition-diagnostic]", entry);

  if (typeof window === "undefined") return entry;

  const current = Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)
    ? window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__
    : [];
  const next = [...current, entry].slice(-100);
  window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = next;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.info("[order-transition-diagnostic] session cache unavailable", error);
  }

  return entry;
}

export function restoreOrderTransitionDiagnostics() {
  if (typeof window === "undefined") return [];
  if (Array.isArray(window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__)) {
    return window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__;
  }

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]");
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = Array.isArray(stored) ? stored : [];
  } catch {
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
  }

  return window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__;
}

restoreOrderTransitionDiagnostics();
