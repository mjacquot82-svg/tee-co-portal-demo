import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { isProductionPersistenceEnforced } from "../lib/persistenceMode";

const WRITE_OPERATIONS = new Set(["create", "update"]);

function buildPersistenceError(operationType, table, reason, error) {
  const persistenceError = new Error(
    `Supabase persistence is required for ${operationType} on ${table}. ${reason}`
  );
  persistenceError.cause = error;
  persistenceError.code = "SUPABASE_PERSISTENCE_REQUIRED";
  return persistenceError;
}

export function shouldBlockPersistenceFallback(
  operationType,
  persistenceEnforced = isProductionPersistenceEnforced
) {
  return persistenceEnforced && WRITE_OPERATIONS.has(operationType);
}

async function runSupabaseOperation(operation, fallbackOperation, options = {}) {
  const { operationType = "read", table = "unknown" } = options;

  if (!isSupabaseConfigured || !supabase) {
    if (shouldBlockPersistenceFallback(operationType)) {
      console.error("[createCrudService] blocked production persistence fallback", {
        table,
        operationType,
        reason: "supabase-unavailable",
        isSupabaseConfigured,
        hasSupabaseClient: Boolean(supabase),
      });
      throw buildPersistenceError(
        operationType,
        table,
        "Supabase is not configured or the client is unavailable."
      );
    }

    return fallbackOperation();
  }

  try {
    const result = await operation();

    if (result?.error) {
      throw result.error;
    }

    return result?.data ?? result;
  } catch (error) {
    if (shouldBlockPersistenceFallback(operationType)) {
      console.error("[createCrudService] blocked production persistence fallback", {
        table,
        operationType,
        reason: "supabase-write-failed",
        message: error?.message || String(error),
        code: error?.code || "",
      });
      throw buildPersistenceError(
        operationType,
        table,
        "Supabase write failed.",
        error
      );
    }

    console.error("Supabase service fallback triggered", error);
    return fallbackOperation();
  }
}

export function createCrudService(config) {
  const {
    table,
    select = "*",
    local,
    buildInsertPayload = (record) => record,
    buildUpdatePayload = (updates) => updates,
    remoteMatchField = "id",
    remoteOrderBy = { column: "created_at", ascending: false },
  } = config;

  return {
    async list() {
      return runSupabaseOperation(async () => {
        let query = supabase.from(table).select(select);

        if (remoteOrderBy?.column) {
          query = query.order(remoteOrderBy.column, {
            ascending: Boolean(remoteOrderBy.ascending),
          });
        }

        return query;
      }, local.list, { operationType: "list", table });
    },

    async getById(identifier) {
      return runSupabaseOperation(
        async () =>
          supabase
            .from(table)
            .select(select)
            .eq(remoteMatchField, identifier)
            .maybeSingle(),
        () => local.getById(identifier),
        { operationType: "getById", table }
      );
    },

    async create(record) {
      return runSupabaseOperation(
        async () =>
          supabase
            .from(table)
            .insert(buildInsertPayload(record))
            .select(select)
            .single(),
        () => local.create(record),
        { operationType: "create", table }
      );
    },

    async update(identifier, updates) {
      return runSupabaseOperation(
        async () =>
          supabase
            .from(table)
            .update(buildUpdatePayload(updates))
            .eq(remoteMatchField, identifier)
            .select(select)
            .single(),
        () => local.update(identifier, updates),
        { operationType: "update", table }
      );
    },
  };
}
