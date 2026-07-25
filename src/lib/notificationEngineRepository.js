import { supabase } from "./supabaseClient";

export const NOTIFICATION_ENGINE_TABLES = Object.freeze({
  businessEvents: "notification_business_events",
  policies: "notification_policies",
  templateVersions: "notification_template_versions",
  notifications: "notifications",
  deliveries: "notification_deliveries",
  deliveryAttempts: "notification_delivery_attempts",
});

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.from) {
    throw new Error("Notification Engine persistence requires a configured Supabase client.");
  }
  return resolved;
}

async function upsertOne(table, row, onConflict, client) {
  const query = resolveClient(client)
    .from(table)
    .upsert(row, { onConflict })
    .select()
    .single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function insertOne(table, row, client) {
  const query = resolveClient(client).from(table).insert(row).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export function persistNotificationBusinessEvent(row, client) {
  return upsertOne(
    NOTIFICATION_ENGINE_TABLES.businessEvents,
    row,
    "event_type,subject_type,subject_id,occurrence_id",
    client
  );
}

export function persistNotificationPolicy(row, client) {
  return upsertOne(
    NOTIFICATION_ENGINE_TABLES.policies,
    row,
    "event_type,version",
    client
  );
}

export function persistNotificationTemplateVersion(row, client) {
  return upsertOne(
    NOTIFICATION_ENGINE_TABLES.templateVersions,
    row,
    "template_type,version",
    client
  );
}

export function persistNotification(row, client) {
  return upsertOne(
    NOTIFICATION_ENGINE_TABLES.notifications,
    row,
    "business_event_id,policy_id,policy_version",
    client
  );
}

export function persistNotificationDelivery(row, client) {
  return upsertOne(
    NOTIFICATION_ENGINE_TABLES.deliveries,
    row,
    "idempotency_key",
    client
  );
}

export function persistNotificationDeliveryAttempt(row, client) {
  return insertOne(NOTIFICATION_ENGINE_TABLES.deliveryAttempts, row, client);
}
