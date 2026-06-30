const PERSISTENCE_MODE_ENV_KEY = "VITE_TEE_CO_PERSISTENCE_MODE";

export const PERSISTENCE_MODES = Object.freeze({
  production: "production",
  development: "development",
  demo: "demo",
  local: "local",
});

export class PersistenceModeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PersistenceModeError";
    this.details = details;
  }
}

function getViteEnv() {
  return typeof import.meta !== "undefined" && import.meta?.env
    ? import.meta.env
    : {};
}

function normalizeMode(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (normalizedValue === "prod" || normalizedValue === "supabase") {
    return PERSISTENCE_MODES.production;
  }

  if (normalizedValue === "dev") {
    return PERSISTENCE_MODES.development;
  }

  if (Object.values(PERSISTENCE_MODES).includes(normalizedValue)) {
    return normalizedValue;
  }

  return "";
}

export function resolvePersistenceMode(env = getViteEnv()) {
  const explicitMode = normalizeMode(env[PERSISTENCE_MODE_ENV_KEY]);
  if (explicitMode) {
    return explicitMode;
  }

  if (env.PROD === true || env.MODE === "production") {
    return PERSISTENCE_MODES.production;
  }

  return PERSISTENCE_MODES.development;
}

export function getPersistenceMode() {
  return resolvePersistenceMode();
}

export function isProductionPersistenceMode(mode = getPersistenceMode()) {
  return mode === PERSISTENCE_MODES.production;
}

export function canUseLocalPersistenceFallback(mode = getPersistenceMode()) {
  return !isProductionPersistenceMode(mode);
}

export function assertSupabasePersistenceAvailable({
  mode = getPersistenceMode(),
  table = "",
  operation = "operation",
  isConfigured = false,
  hasClient = false,
} = {}) {
  if (!isProductionPersistenceMode(mode)) {
    return;
  }

  if (isConfigured && hasClient) {
    return;
  }

  throw new PersistenceModeError(
    `Supabase persistence is required for ${operation}${table ? ` on ${table}` : ""}.`,
    {
      mode,
      table,
      operation,
      isConfigured: Boolean(isConfigured),
      hasClient: Boolean(hasClient),
    }
  );
}

export function buildSupabasePersistenceFailure({
  mode = getPersistenceMode(),
  table = "",
  operation = "operation",
  cause,
} = {}) {
  const error = new PersistenceModeError(
    `Supabase ${operation}${table ? ` on ${table}` : ""} failed in ${mode} persistence mode.`,
    {
      mode,
      table,
      operation,
      cause,
    }
  );
  error.cause = cause;
  return error;
}
