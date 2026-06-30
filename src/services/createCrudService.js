import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  assertSupabasePersistenceAvailable,
  buildSupabasePersistenceFailure,
  canUseLocalPersistenceFallback,
  getPersistenceMode,
} from "../lib/persistenceMode";

async function runSupabaseOperation(operation, fallbackOperation, options = {}) {
  const {
    table = "",
    operationName = "operation",
    supabaseClient = supabase,
    supabaseConfigured = isSupabaseConfigured,
    persistenceMode = getPersistenceMode(),
  } = options;
  const hasSupabaseClient = Boolean(supabaseClient);

  assertSupabasePersistenceAvailable({
    mode: persistenceMode,
    table,
    operation: operationName,
    isConfigured: supabaseConfigured,
    hasClient: hasSupabaseClient,
  });

  if (!supabaseConfigured || !hasSupabaseClient) {
    return fallbackOperation();
  }

  try {
    const result = await operation(supabaseClient);

    if (result?.error) {
      throw result.error;
    }

    return result?.data ?? result;
  } catch (error) {
    if (!canUseLocalPersistenceFallback(persistenceMode)) {
      throw buildSupabasePersistenceFailure({
        mode: persistenceMode,
        table,
        operation: operationName,
        cause: error,
      });
    }

    console.error("Supabase service fallback triggered", {
      mode: persistenceMode,
      table,
      operation: operationName,
      error,
    });
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
    supabaseClient = supabase,
    supabaseConfigured = isSupabaseConfigured,
    persistenceMode = getPersistenceMode,
  } = config;

  function resolvePersistenceMode() {
    return typeof persistenceMode === "function" ? persistenceMode() : persistenceMode;
  }

  return {
    async list() {
      return runSupabaseOperation(async (client) => {
        let query = client.from(table).select(select);

        if (remoteOrderBy?.column) {
          query = query.order(remoteOrderBy.column, {
            ascending: Boolean(remoteOrderBy.ascending),
          });
        }

        return query;
      }, local.list, {
        table,
        operationName: "list",
        supabaseClient,
        supabaseConfigured,
        persistenceMode: resolvePersistenceMode(),
      });
    },

    async getById(identifier) {
      return runSupabaseOperation(
        async (client) =>
          client
            .from(table)
            .select(select)
            .eq(remoteMatchField, identifier)
            .maybeSingle(),
        () => local.getById(identifier),
        {
          table,
          operationName: "get",
          supabaseClient,
          supabaseConfigured,
          persistenceMode: resolvePersistenceMode(),
        }
      );
    },

    async create(record) {
      return runSupabaseOperation(
        async (client) =>
          client
            .from(table)
            .insert(buildInsertPayload(record))
            .select(select)
            .single(),
        () => local.create(record),
        {
          table,
          operationName: "create",
          supabaseClient,
          supabaseConfigured,
          persistenceMode: resolvePersistenceMode(),
        }
      );
    },

    async update(identifier, updates) {
      return runSupabaseOperation(
        async (client) =>
          client
            .from(table)
            .update(buildUpdatePayload(updates))
            .eq(remoteMatchField, identifier)
            .select(select)
            .single(),
        () => local.update(identifier, updates),
        {
          table,
          operationName: "update",
          supabaseClient,
          supabaseConfigured,
          persistenceMode: resolvePersistenceMode(),
        }
      );
    },
  };
}
