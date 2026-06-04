const viteEnv = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};

function normalizeBooleanFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export function resolvePersistenceMode(env = viteEnv) {
  const isProductionBuild = Boolean(env.PROD);
  const requiresSupabasePersistence = normalizeBooleanFlag(
    env.VITE_REQUIRE_SUPABASE_PERSISTENCE
  );

  return {
    isProductionBuild,
    requiresSupabasePersistence,
    isProductionPersistenceEnforced: isProductionBuild || requiresSupabasePersistence,
  };
}

export const {
  isProductionBuild,
  requiresSupabasePersistence,
  isProductionPersistenceEnforced,
} = resolvePersistenceMode();
