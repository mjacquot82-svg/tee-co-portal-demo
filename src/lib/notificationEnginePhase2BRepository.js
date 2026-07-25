import { supabase } from "./supabaseClient";
import { NOTIFICATION_ENGINE_TABLES } from "./notificationEngineRepository";

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.from) {
    throw new Error("Notification Engine persistence requires a configured Supabase client.");
  }
  return resolved;
}

export async function findCurrentNotificationPolicy(eventType, occurredAt, client) {
  let query = resolveClient(client)
    .from(NOTIFICATION_ENGINE_TABLES.policies)
    .select("*")
    .eq("event_type", String(eventType || "").trim())
    .is("effective_to", null);

  if (occurredAt) {
    query = query.lte("effective_from", occurredAt);
  }

  const { data, error } = await query
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

