import { supabase } from "./supabaseClient";
import { NOTIFICATION_ENGINE_TABLES } from "./notificationEngineRepository";

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.from) {
    throw new Error("Notification Engine persistence requires a configured Supabase client.");
  }
  return resolved;
}

export async function findPublishedNotificationTemplateVersion({
  templateVersionId,
  templateType,
  client,
}) {
  const assignedTemplateType = String(templateVersionId || "")
    .trim()
    .replace(/:v\d+$/, "");
  let query = resolveClient(client)
    .from(NOTIFICATION_ENGINE_TABLES.templateVersions)
    .select("*")
    .eq("status", "published");

  if (templateVersionId) {
    query = query
      .eq("template_type", assignedTemplateType)
      .order("version", { ascending: false })
      .limit(1);
  } else {
    query = query
      .eq("template_type", String(templateType || "").trim())
      .order("version", { ascending: false })
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}
