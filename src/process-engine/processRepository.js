import { getJsonStorageItem, setJsonStorageItem } from "../lib/browserStorage";
import {
  assertSupabasePersistenceAvailable,
  buildSupabasePersistenceFailure,
  canUseLocalPersistenceFallback,
  getPersistenceMode,
} from "../lib/persistenceMode";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const PROCESS_INSTANCES_TABLE = "process_instances";
const LOCAL_STORAGE_KEY = "jdsProcessInstances";
let memoryInstances = [];
let testConfiguration = null;

function getConfiguration() {
  return {
    client: testConfiguration?.supabaseClient || supabase,
    configured:
      testConfiguration?.supabaseConfigured ?? isSupabaseConfigured,
    mode: testConfiguration?.persistenceMode || getPersistenceMode(),
  };
}

function getLocalInstances() {
  const stored = getJsonStorageItem(LOCAL_STORAGE_KEY, null);
  return Array.isArray(stored) ? stored : memoryInstances;
}

function saveLocalInstances(instances) {
  memoryInstances = instances;
  setJsonStorageItem(LOCAL_STORAGE_KEY, instances);
}

function buildPayload(instance) {
  return {
    id: instance.id,
    application_key: instance.applicationKey,
    subject_type: instance.subjectType,
    subject_id: instance.subjectId,
    template_key: instance.templateKey,
    template_version: instance.templateVersion,
    state: instance.state,
    template_snapshot: instance.templateSnapshot,
    task_instances: instance.taskInstances,
    history: instance.history,
    started_at: instance.startedAt,
    completed_at: instance.completedAt,
    cancelled_at: instance.cancelledAt,
    created_at: instance.createdAt,
    updated_at: instance.updatedAt,
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationKey: row.application_key,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    state: row.state,
    templateSnapshot: row.template_snapshot || {},
    taskInstances: Array.isArray(row.task_instances) ? row.task_instances : [],
    history: Array.isArray(row.history) ? row.history : [],
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchesIdentity(instance, identity) {
  return (
    instance.applicationKey === identity.applicationKey &&
    instance.subjectType === identity.subjectType &&
    instance.subjectId === identity.subjectId &&
    instance.templateKey === identity.templateKey
  );
}

export async function findProcessInstance(identity) {
  const { client, configured, mode } = getConfiguration();
  assertSupabasePersistenceAvailable({
    mode,
    table: PROCESS_INSTANCES_TABLE,
    operation: "find process instance",
    isConfigured: configured,
    hasClient: Boolean(client),
  });

  if (!configured || !client) {
    return getLocalInstances().find((instance) => matchesIdentity(instance, identity)) || null;
  }

  try {
    const result = await client
      .from(PROCESS_INSTANCES_TABLE)
      .select("*")
      .eq("application_key", identity.applicationKey)
      .eq("subject_type", identity.subjectType)
      .eq("subject_id", identity.subjectId)
      .eq("template_key", identity.templateKey)
      .maybeSingle();
    if (result?.error) throw result.error;
    return mapRow(result?.data);
  } catch (error) {
    if (!canUseLocalPersistenceFallback(mode)) {
      throw buildSupabasePersistenceFailure({
        mode,
        table: PROCESS_INSTANCES_TABLE,
        operation: "find process instance",
        cause: error,
      });
    }
    return getLocalInstances().find((instance) => matchesIdentity(instance, identity)) || null;
  }
}

export async function createProcessInstance(instance) {
  const { client, configured, mode } = getConfiguration();
  assertSupabasePersistenceAvailable({
    mode,
    table: PROCESS_INSTANCES_TABLE,
    operation: "create process instance",
    isConfigured: configured,
    hasClient: Boolean(client),
  });

  if (!configured || !client) {
    const existing = getLocalInstances().find((entry) => matchesIdentity(entry, instance));
    if (existing) return existing;
    saveLocalInstances([instance, ...getLocalInstances()]);
    return instance;
  }

  try {
    const result = await client
      .from(PROCESS_INSTANCES_TABLE)
      .insert(buildPayload(instance))
      .select("*")
      .single();
    if (result?.error) throw result.error;
    return mapRow(result?.data);
  } catch (error) {
    if (error?.code === "23505") {
      return findProcessInstance(instance);
    }
    if (!canUseLocalPersistenceFallback(mode)) {
      throw buildSupabasePersistenceFailure({
        mode,
        table: PROCESS_INSTANCES_TABLE,
        operation: "create process instance",
        cause: error,
      });
    }
    const existing = getLocalInstances().find((entry) => matchesIdentity(entry, instance));
    if (existing) return existing;
    saveLocalInstances([instance, ...getLocalInstances()]);
    return instance;
  }
}

export function configureProcessRepositoryForTests(configuration = null) {
  testConfiguration = configuration;
  memoryInstances = [];
}
