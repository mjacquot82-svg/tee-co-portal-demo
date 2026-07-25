import { supabase } from "./supabaseClient";
import { listNotificationActivity } from "./notificationDeliveryService";

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.from) throw new Error("Notification Activity requires Supabase.");
  return resolved;
}

function mapLegacyRecord(record = {}) {
  return {
    id: record.id,
    recordKind: "legacy",
    eventType: record.eventType,
    subjectType: "order",
    subjectId: record.metadata?.orderNumber || "",
    notificationStatus: "legacy_recorded",
    aggregateState: "legacy_recorded",
    policySnapshot: {},
    recipient: record.recipient || {},
    templateName: record.templateName || record.templateType,
    generatedContent: record.generatedContent || {},
    createdAt: record.created_at,
    deliveries: [],
  };
}

function mapOperationalRow(row = {}) {
  return {
    id: row.notification_id,
    recordKind: "engine",
    eventType: row.event_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    notificationStatus: row.notification_status,
    aggregateState: row.aggregate_state || row.notification_status,
    policySnapshot: row.policy_snapshot || {},
    createdAt: row.notification_created_at,
    updatedAt: row.notification_updated_at,
    deliveries: Array.isArray(row.deliveries) ? row.deliveries : [],
  };
}

export async function loadDeliveryAwareNotificationActivity({ client } = {}) {
  const legacyRecords = listNotificationActivity().map(mapLegacyRecord);
  try {
    const { data, error } = await resolveClient(client)
      .from("notification_engine_activity")
      .select("*")
      .order("notification_created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const engineRecords = (Array.isArray(data) ? data : []).map(mapOperationalRow);
    const legacyIds = new Set(engineRecords.map((record) => record.id));
    return {
      records: [
        ...engineRecords,
        ...legacyRecords.filter((record) => !legacyIds.has(record.id)),
      ].sort(
        (left, right) =>
          new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
      ),
      durableActivityAvailable: true,
      durableActivityError: "",
    };
  } catch (error) {
    console.warn("[notificationActivityRepository] Durable activity unavailable; showing legacy history.", error);
    return {
      records: legacyRecords,
      durableActivityAvailable: false,
      durableActivityError:
        String(error?.message || "").trim() ||
        "Durable Notification Engine activity could not be loaded.",
    };
  }
}

export async function listDeliveryAwareNotificationActivity(options = {}) {
  const result = await loadDeliveryAwareNotificationActivity(options);
  return result.records;
}
