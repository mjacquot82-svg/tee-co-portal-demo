import { useSyncExternalStore } from "react";
import {
  getJsonStorageItem,
  getRawStorageItem,
  hasBrowserStorage,
  setJsonStorageItem,
} from "./browserStorage";
import { addCustomerTimelineEvent } from "./customerTimelineStore";
import {
  customerIdsEqual,
  ensureCanonicalCustomerId,
  normalizeCustomerId,
} from "./customerIds";
import { supabase } from "./supabase";

const STORAGE_KEY = "teeCoCustomers";
const SUPABASE_TABLE = "customers";
const REQUIRED_SUPABASE_SELECT_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "company",
  "notes",
  "auth_user_id",
  "created_at",
  "updated_at",
];
const OPTIONAL_SUPABASE_SELECT_FIELDS = [
  "external_reference",
  "archived",
  "archived_at",
  "merged_into_customer_id",
  "merged_at",
  "merged_customer_ids",
];
const customerListeners = new Set();
const EMPTY_CUSTOMERS = [];

let cachedCustomersRaw = null;
let cachedCustomersSnapshot = EMPTY_CUSTOMERS;
let customersHydrationPromise = null;
let hasLoggedFallbackActivation = false;
let activeOptionalSupabaseFields = [...OPTIONAL_SUPABASE_SELECT_FIELDS];

function emitCustomersUpdated() {
  customerListeners.forEach((listener) => listener());
}

function shouldUseSupabase() {
  return Boolean(supabase?.from);
}

function normalizeOrderNumbers(orderNumbers) {
  if (!Array.isArray(orderNumbers)) return [];
  return orderNumbers.filter(Boolean);
}

function normalizeMergedCustomerIds(mergedCustomerIds) {
  if (!Array.isArray(mergedCustomerIds)) {
    return [];
  }

  return Array.from(
    new Set(
      mergedCustomerIds
        .map((customerId) => normalizeCustomerId(customerId))
        .filter(Boolean)
    )
  );
}

function normalizeCustomer(customer = {}, fallbackTimestamp = new Date().toISOString()) {
  const createdAt = customer.created_at || fallbackTimestamp;
  const canonicalCustomerId = ensureCanonicalCustomerId(
    customer.id || customer.customer_id,
    createdAt
  );

  return {
    ...customer,
    id: canonicalCustomerId,
    customer_id: canonicalCustomerId,
    name: customer.name || "New Customer",
    company: customer.company || "",
    phone: customer.phone || "",
    email: customer.email || "",
    auth_user_id: customer.auth_user_id || "",
    external_reference: customer.external_reference || "",
    notes: customer.notes || "",
    order_numbers: normalizeOrderNumbers(customer.order_numbers),
    archived: Boolean(customer.archived),
    archived_at: customer.archived ? customer.archived_at || customer.updated_at || createdAt : null,
    merged_into_customer_id: normalizeCustomerId(customer.merged_into_customer_id),
    merged_at: customer.merged_at || "",
    merged_customer_ids: normalizeMergedCustomerIds(customer.merged_customer_ids),
    created_at: createdAt,
    updated_at: customer.updated_at || createdAt,
  };
}

function normalizeCustomers(customers) {
  if (!Array.isArray(customers)) return EMPTY_CUSTOMERS;
  return customers.map((customer) => normalizeCustomer(customer));
}

function pickCustomerTimelineSnapshot(customer = {}) {
  return {
    name: customer.name || "",
    company: customer.company || "",
    phone: customer.phone || "",
    email: customer.email || "",
    notes: customer.notes || "",
    archived: Boolean(customer.archived),
  };
}

function buildCustomerChangeSet(previousCustomer = {}, nextCustomer = {}) {
  const previousSnapshot = pickCustomerTimelineSnapshot(previousCustomer);
  const nextSnapshot = pickCustomerTimelineSnapshot(nextCustomer);

  return Object.keys(nextSnapshot).reduce((changes, field) => {
    if (previousSnapshot[field] === nextSnapshot[field]) {
      return changes;
    }

    return {
      ...changes,
      [field]: {
        from: previousSnapshot[field],
        to: nextSnapshot[field],
      },
    };
  }, {});
}

function buildCustomerUpdateSummary(changes, customerName) {
  const changedFields = Object.keys(changes);

  if (!changedFields.length) {
    return "";
  }

  if (changedFields.length === 1 && changedFields[0] === "archived") {
    return changes.archived.to ? "Customer archived." : "Customer restored from archive.";
  }

  if (changedFields.length === 1) {
    const label = changedFields[0].replace(/_/g, " ");
    return `Customer ${label} updated${customerName ? ` for ${customerName}` : ""}.`;
  }

  return `Customer record updated${customerName ? ` for ${customerName}` : ""}.`;
}

function logFallbackActivation(reason, error) {
  console.warn("[customersStore] fallback activation", {
    reason,
    hasError: Boolean(error),
    table: SUPABASE_TABLE,
    error,
  });

  if (error) {
    console.error(`[customersStore] Supabase failure during ${reason}`, error);
  } else {
    console.error(`[customersStore] Supabase failure during ${reason}`);
  }

  if (hasLoggedFallbackActivation) return;

  hasLoggedFallbackActivation = true;
  console.warn("[customersStore] Local fallback activated");
}

function buildSupabaseSelectFields(optionalFields = activeOptionalSupabaseFields) {
  return [...REQUIRED_SUPABASE_SELECT_FIELDS, ...optionalFields].join(", ");
}

function extractMissingSchemaColumn(error) {
  const message = String(error?.message || "");
  const missingQuotedColumn = message.match(/Could not find the '([^']+)' column/i)?.[1];
  if (missingQuotedColumn) {
    return missingQuotedColumn;
  }

  const undefinedColumn = message.match(/column\s+["']?([a-z0-9_]+)["']?\s+does not exist/i)?.[1];
  return undefinedColumn || "";
}

function removeUnsupportedOptionalField(fieldName) {
  if (!fieldName) {
    return false;
  }

  if (!activeOptionalSupabaseFields.includes(fieldName)) {
    return false;
  }

  activeOptionalSupabaseFields = activeOptionalSupabaseFields.filter((field) => field !== fieldName);
  console.warn("[customersStore] schema fallback removed unsupported optional customer column", {
    table: SUPABASE_TABLE,
    fieldName,
    remainingOptionalFields: activeOptionalSupabaseFields,
  });
  return true;
}

function syncCachedCustomersRaw(customers) {
  cachedCustomersRaw = JSON.stringify(customers);
}

function persistCustomersSnapshot(customers, options = {}) {
  const { emit = true, writeStorage = true } = options;
  const normalizedCustomers = normalizeCustomers(customers);

  cachedCustomersSnapshot = normalizedCustomers;
  syncCachedCustomersRaw(normalizedCustomers);

  if (writeStorage && hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, normalizedCustomers);
  }

  if (emit) {
    emitCustomersUpdated();
  }

  return normalizedCustomers;
}

function readCustomersFromStorage() {
  if (!hasBrowserStorage()) return EMPTY_CUSTOMERS;

  try {
    const rawCustomers = getRawStorageItem(STORAGE_KEY);
    const normalizedRawCustomers = rawCustomers || "";

    if (normalizedRawCustomers === cachedCustomersRaw) {
      return cachedCustomersSnapshot;
    }

    const customers = getJsonStorageItem(STORAGE_KEY, EMPTY_CUSTOMERS);
    cachedCustomersRaw = normalizedRawCustomers;
    cachedCustomersSnapshot = normalizeCustomers(customers);
    return cachedCustomersSnapshot;
  } catch (error) {
    console.error("Unable to read stored Tee & Co customers", error);
    cachedCustomersRaw = null;
    cachedCustomersSnapshot = EMPTY_CUSTOMERS;
    return EMPTY_CUSTOMERS;
  }
}

function mapSupabaseRowToCustomer(row, localCustomer) {
  return normalizeCustomer({
    ...localCustomer,
    id: row?.id || localCustomer?.id,
    name: row?.name ?? localCustomer?.name,
    company: row?.company ?? localCustomer?.company,
    phone: row?.phone ?? localCustomer?.phone,
    email: row?.email ?? localCustomer?.email,
    notes: row?.notes ?? localCustomer?.notes,
    auth_user_id: row?.auth_user_id ?? localCustomer?.auth_user_id,
    external_reference: row?.external_reference ?? localCustomer?.external_reference,
    archived: row?.archived ?? localCustomer?.archived,
    archived_at: row?.archived_at ?? localCustomer?.archived_at,
    created_at: row?.created_at || localCustomer?.created_at,
    updated_at: row?.updated_at || localCustomer?.updated_at,
  });
}

function mergeHydratedCustomers(remoteRows, localCustomers) {
  const localCustomersById = new Map(
    normalizeCustomers(localCustomers).map((customer) => [normalizeCustomerId(customer.id), customer])
  );
  const remoteCustomers = remoteRows.map((row) => {
    const canonicalCustomerId = normalizeCustomerId(row?.id);
    const localCustomer = localCustomersById.get(canonicalCustomerId);
    localCustomersById.delete(canonicalCustomerId);
    return mapSupabaseRowToCustomer(row, localCustomer);
  });
  const localOnlyCustomers = Array.from(localCustomersById.values());

  if (localOnlyCustomers.length > 0) {
    console.warn("[customersStore] Hydration preserved local-only fallback customers", {
      count: localOnlyCustomers.length,
    });
  }

  return [...remoteCustomers, ...localOnlyCustomers];
}

function buildSupabaseCustomerPayload(customer) {
  const canonicalCustomer = normalizeCustomer(customer);

  return {
    id: canonicalCustomer.id,
    name: canonicalCustomer.name || "New Customer",
    email: canonicalCustomer.email || "",
    phone: canonicalCustomer.phone || "",
    company: canonicalCustomer.company || "",
    notes: canonicalCustomer.notes || "",
    external_reference: canonicalCustomer.external_reference || "",
    archived: Boolean(canonicalCustomer.archived),
    archived_at: canonicalCustomer.archived ? canonicalCustomer.archived_at || null : null,
    merged_into_customer_id: canonicalCustomer.merged_into_customer_id || null,
    merged_at: canonicalCustomer.merged_at || null,
    merged_customer_ids: canonicalCustomer.merged_customer_ids || [],
    created_at: canonicalCustomer.created_at || new Date().toISOString(),
    updated_at: canonicalCustomer.updated_at || new Date().toISOString(),
  };
}

async function executeSupabaseCustomerUpsert(payload, operation) {
  let nextPayload = { ...payload };

  while (true) {
    const selectFields = buildSupabaseSelectFields();
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(nextPayload, { onConflict: "id" })
      .select(selectFields)
      .single();

    if (!error) {
      return { data, payload: nextPayload };
    }

    const missingColumn = extractMissingSchemaColumn(error);
    const removedPayloadColumn =
      missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn);
    const removedSelectColumn = removeUnsupportedOptionalField(missingColumn);

    if (!removedPayloadColumn && !removedSelectColumn) {
      logFallbackActivation(operation, error);
      console.error("[customersStore] Supabase upsert/select returned error", {
        operation,
        table: SUPABASE_TABLE,
        payload: nextPayload,
        error,
      });
      throw error;
    }

    if (removedPayloadColumn) {
      delete nextPayload[missingColumn];
      console.warn("[customersStore] schema fallback removed unsupported customer payload column", {
        table: SUPABASE_TABLE,
        operation,
        missingColumn,
        remainingPayloadColumns: Object.keys(nextPayload),
      });
    }
  }
}

async function fetchSupabaseCustomersWithSchemaFallback() {
  while (true) {
    const selectFields = buildSupabaseSelectFields();
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select(selectFields)
      .order("created_at", { ascending: false });

    if (!error) {
      return data || [];
    }

    const missingColumn = extractMissingSchemaColumn(error);
    const removedSelectColumn = removeUnsupportedOptionalField(missingColumn);
    if (!removedSelectColumn) {
      throw error;
    }
  }
}

async function persistCustomerToSupabase(customer, operation) {
  console.info("[customersStore] persistCustomerToSupabase entry", {
    operation,
    table: SUPABASE_TABLE,
    customer,
    hasSupabaseClient: Boolean(supabase),
    hasFromMethod: Boolean(supabase?.from),
  });

  if (!shouldUseSupabase()) {
    const error = new Error("Supabase client unavailable");
    console.error("[customersStore] persistence skipped before network start", {
      operation,
      table: SUPABASE_TABLE,
      customer,
      error,
    });
    logFallbackActivation(operation, error);
    throw error;
  }

  console.info(`[customersStore] ${operation} started`, {
    customerId: customer.id,
  });

  try {
    const payload = buildSupabaseCustomerPayload(customer);
    console.info("[customersStore] upsert before", {
      operation,
      table: SUPABASE_TABLE,
      payload,
    });
    console.info("[customersStore] immediately before supabase.from(...)", {
      operation,
      table: SUPABASE_TABLE,
      payload,
    });
    const upsertQuery = supabase.from(SUPABASE_TABLE).upsert(payload, { onConflict: "id" });
    console.info("[customersStore] upsert after", {
      operation,
      table: SUPABASE_TABLE,
      queryConstructed: Boolean(upsertQuery),
    });

    console.info("[customersStore] select before", {
      operation,
      table: SUPABASE_TABLE,
      selectFields: buildSupabaseSelectFields(),
    });
    const { data } = await executeSupabaseCustomerUpsert(payload, operation);
    console.info("[customersStore] select after", {
      operation,
      table: SUPABASE_TABLE,
      data,
      error: null,
    });

    const currentCustomers = readCustomersFromStorage();
    const localCustomer =
      currentCustomers.find((entry) => customerIdsEqual(entry.id, customer.id)) || customer;
    const persistedCustomer = mapSupabaseRowToCustomer(data, localCustomer);
    const hasExistingCustomer = currentCustomers.some(
      (entry) => customerIdsEqual(entry.id, persistedCustomer.id)
    );
    const nextCustomers = hasExistingCustomer
      ? currentCustomers.map((entry) =>
          customerIdsEqual(entry.id, persistedCustomer.id) ? persistedCustomer : entry
        )
      : [persistedCustomer, ...currentCustomers];

    persistCustomersSnapshot(nextCustomers, { emit: true, writeStorage: true });

    console.info(`[customersStore] ${operation} succeeded`, {
      customerId: persistedCustomer.id,
      table: SUPABASE_TABLE,
      data,
    });

    return persistedCustomer;
  } catch (error) {
    console.error("[customersStore] persistence aborted", {
      operation,
      table: SUPABASE_TABLE,
      customer,
      error,
    });
    logFallbackActivation(operation, error);
    console.error("[customersStore] Supabase persistence threw", {
      operation,
      table: SUPABASE_TABLE,
      customer,
      error,
    });
    throw error;
  }
}

export function ensureCustomersHydrated() {
  if (customersHydrationPromise) {
    return customersHydrationPromise;
  }

  if (!shouldUseSupabase()) {
    logFallbackActivation("hydration", new Error("Supabase client unavailable"));
    customersHydrationPromise = Promise.resolve(getStoredCustomers());
    return customersHydrationPromise;
  }

  customersHydrationPromise = (async () => {
    const localCustomers = readCustomersFromStorage();

    console.info("[customersStore] hydration started", {
      localCount: localCustomers.length,
      table: SUPABASE_TABLE,
    });

    try {
      console.info("[customersStore] hydration before select", {
        table: SUPABASE_TABLE,
        selectFields: buildSupabaseSelectFields(),
      });
      const data = await fetchSupabaseCustomersWithSchemaFallback();
      console.info("[customersStore] hydration after select", {
        table: SUPABASE_TABLE,
        data,
        error: null,
      });

      const hydratedCustomers = mergeHydratedCustomers(data || [], readCustomersFromStorage());
      persistCustomersSnapshot(hydratedCustomers, { emit: true, writeStorage: true });

      console.info("[customersStore] hydration succeeded", {
        table: SUPABASE_TABLE,
        remoteCount: Array.isArray(data) ? data.length : 0,
        hydratedCount: hydratedCustomers.length,
      });

      return hydratedCustomers;
    } catch (error) {
      logFallbackActivation("hydration", error);
      return localCustomers;
    }
  })();

  return customersHydrationPromise;
}

export function getStoredCustomers() {
  const customers = readCustomersFromStorage();

  if (typeof window !== "undefined") {
    void ensureCustomersHydrated();
  }

  return customers;
}

export function saveStoredCustomers(customers) {
  return persistCustomersSnapshot(customers, { emit: true, writeStorage: true });
}

export function subscribeToStoredCustomers(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  customerListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      customerListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      cachedCustomersRaw = null;
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    customerListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStoredCustomers() {
  if (typeof window !== "undefined") {
    void ensureCustomersHydrated();
  }

  return useSyncExternalStore(
    subscribeToStoredCustomers,
    getStoredCustomers,
    () => EMPTY_CUSTOMERS
  );
}

export async function createStoredCustomer(customerInput) {
  console.info("[customersStore] createStoredCustomer entry", {
    table: SUPABASE_TABLE,
    customerInput,
  });

  const currentCustomers = getStoredCustomers();
  const createdAt = new Date().toISOString();

  try {
    const customer = normalizeCustomer({
      id: ensureCanonicalCustomerId(customerInput.id, createdAt),
      name: customerInput.name || "New Customer",
      company: customerInput.company || "",
      phone: customerInput.phone || "",
      email: customerInput.email || "",
      auth_user_id: customerInput.auth_user_id || "",
      external_reference: customerInput.external_reference || "",
      notes: customerInput.notes || "",
      order_numbers: customerInput.order_numbers || [],
      created_at: createdAt,
      updated_at: createdAt,
    });

    persistCustomersSnapshot([customer, ...currentCustomers], {
      emit: true,
      writeStorage: true,
    });

    addCustomerTimelineEvent(customer.id, {
      eventType: "customer_created",
      summary: `Customer record created${customer.name ? ` for ${customer.name}` : ""}.`,
      metadata: {
        customerName: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
      },
    });

    console.info("[customersStore] before persistCustomerToSupabase call", {
      operation: "create",
      table: SUPABASE_TABLE,
      customer,
    });

    return await persistCustomerToSupabase(customer, "create");
  } catch (error) {
    console.error("[customersStore] createStoredCustomer aborted before completion", {
      table: SUPABASE_TABLE,
      customerInput,
      error,
    });
    throw error;
  }
}

export async function updateStoredCustomer(customerId, updates, options = {}) {
  const currentCustomers = getStoredCustomers();
  const normalizedCustomerId = normalizeCustomerId(customerId);
  const existingCustomer = currentCustomers.find((customer) =>
    customerIdsEqual(customer.id, normalizedCustomerId)
  );

  if (!existingCustomer) {
    return null;
  }

  const nextCustomer = normalizeCustomer({
    ...existingCustomer,
    ...updates,
    id: updates.id || existingCustomer.id,
    updated_at: new Date().toISOString(),
  });
  const nextCustomers = currentCustomers.map((customer) =>
    customerIdsEqual(customer.id, normalizedCustomerId) ? nextCustomer : customer
  );

  persistCustomersSnapshot(nextCustomers, { emit: true, writeStorage: true });

  if (!options.suppressTimelineEvent) {
    const changes = buildCustomerChangeSet(existingCustomer, nextCustomer);
    const changedFields = Object.keys(changes);
    const summary = buildCustomerUpdateSummary(changes, nextCustomer.name);

    if (changedFields.length && summary) {
      addCustomerTimelineEvent(nextCustomer.id, {
        eventType: "customer_updated",
        summary,
        metadata: {
          changedFields,
          changes,
        },
      });
    }
  }

  return persistCustomerToSupabase(nextCustomer, "update");
}

export function findStoredCustomer(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  return getStoredCustomers().find((customer) => customerIdsEqual(customer.id, normalizedCustomerId));
}

export async function linkOrderToCustomer(customerId, orderNumber) {
  const customer = findStoredCustomer(customerId);
  if (!customer) return null;

  const orderNumbers = new Set(customer.order_numbers || []);
  orderNumbers.add(orderNumber);

  return updateStoredCustomer(customer.id, {
    order_numbers: Array.from(orderNumbers),
  }, {
    suppressTimelineEvent: true,
  });
}

if (typeof window !== "undefined") {
  void ensureCustomersHydrated();
}
