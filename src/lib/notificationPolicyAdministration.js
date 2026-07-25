import { NOTIFICATION_TYPE_LABELS, listNotificationTemplates } from "./notificationTemplatesStore";
import { buildPhase2APolicySeed } from "./notificationEngineFoundation";
import { supabase } from "./supabaseClient";

export const LEGACY_TRIGGER_EVENT_ALIASES = Object.freeze({
  moved_to_production: "order_in_production",
  production_started: "order_in_production",
  ready_for_pickup: "order_ready_for_pickup",
  deposit_received: "payment_received",
});

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.from) {
    throw new Error("Notification Policy administration requires Supabase.");
  }
  return resolved;
}

function normalizeAssignment(value) {
  return String(value || "").trim();
}

export function reconcileLegacyTriggerEventType(eventType) {
  const normalized = String(eventType || "").trim();
  return LEGACY_TRIGGER_EVENT_ALIASES[normalized] || normalized;
}

export function normalizeNotificationPolicyDraft(policy = {}) {
  const deliveryMode = policy.delivery_mode || (policy.automatic === false ? "approval_required" : "automatic");
  return {
    ...policy,
    enabled: Boolean(policy.enabled),
    delivery_mode: deliveryMode,
    email_enabled: Boolean(policy.email_enabled),
    sms_enabled: Boolean(policy.sms_enabled),
    staff_notification_enabled: Boolean(policy.staff_notification_enabled),
    customer_audience_enabled: Boolean(policy.customer_audience_enabled),
    staff_audience_enabled: Boolean(policy.staff_audience_enabled),
    owner_audience_enabled: Boolean(policy.owner_audience_enabled),
    channel_template_assignments: {
      email: normalizeAssignment(policy.channel_template_assignments?.email),
      sms: normalizeAssignment(policy.channel_template_assignments?.sms),
      staff: normalizeAssignment(policy.channel_template_assignments?.staff),
    },
  };
}

export function validateNotificationPolicyDraft(policy = {}, templates = []) {
  const normalized = normalizeNotificationPolicyDraft(policy);
  const templateTypes = new Set(templates.map((template) => template.type));
  const errors = [];

  for (const channel of ["email", "sms", "staff"]) {
    const enabled = channel === "staff"
      ? normalized.staff_notification_enabled
      : normalized[`${channel}_enabled`];
    const assignment = normalized.channel_template_assignments[channel];
    const templateType = assignment.replace(/:v\d+$/, "");
    if (enabled && !assignment) errors.push(`${channel} requires a template assignment.`);
    if (assignment && !templateTypes.has(templateType)) {
      errors.push(`${channel} references an unavailable template.`);
    }
  }

  if (
    normalized.enabled &&
    !normalized.customer_audience_enabled &&
    !normalized.staff_audience_enabled &&
    !normalized.owner_audience_enabled
  ) {
    errors.push("An enabled policy requires at least one audience.");
  }

  return errors;
}

function buildFallbackPolicies() {
  return listNotificationTemplates().map((template) => normalizeNotificationPolicyDraft(
    buildPhase2APolicySeed(template)
  ));
}

export async function listCurrentNotificationPolicies(client) {
  const resolved = resolveClient(client);
  const { data, error } = await resolved
    .from("notification_policies")
    .select("*")
    .is("effective_to", null)
    .order("event_type", { ascending: true });
  if (error) throw error;

  const persisted = Array.isArray(data) ? data : [];
  const byEvent = new Map(
    persisted.map((policy) => [reconcileLegacyTriggerEventType(policy.event_type), policy])
  );

  return buildFallbackPolicies().map((fallback) => {
    const policy = byEvent.get(fallback.event_type) || fallback;
    return {
      ...normalizeNotificationPolicyDraft(policy),
      event_label: NOTIFICATION_TYPE_LABELS[policy.event_type] || policy.event_type,
      persisted: Boolean(byEvent.get(fallback.event_type)),
    };
  });
}

export async function listPublishedTemplateAssignments(client) {
  const resolved = resolveClient(client);
  const { data, error } = await resolved
    .from("notification_template_versions")
    .select("id, template_type, version, name, status")
    .eq("status", "published")
    .order("template_type", { ascending: true })
    .order("version", { ascending: false });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length) return rows;
  return listNotificationTemplates().map((template) => ({
    id: `${template.type}:v1`,
    template_type: template.type,
    version: 1,
    name: template.name,
    status: "published",
  }));
}

export async function saveNotificationPolicyVersion(policy, { client } = {}) {
  const templates = listNotificationTemplates();
  const normalized = normalizeNotificationPolicyDraft(policy);
  const errors = validateNotificationPolicyDraft(normalized, templates);
  if (errors.length) throw new Error(errors.join(" "));

  const resolved = resolveClient(client);
  if (!resolved.rpc) throw new Error("Notification Policy versioning RPC is unavailable.");
  const { data, error } = await resolved.rpc("save_notification_policy_version", {
    p_event_type: reconcileLegacyTriggerEventType(normalized.event_type),
    p_enabled: normalized.enabled,
    p_delivery_mode: normalized.delivery_mode,
    p_email_enabled: normalized.email_enabled,
    p_sms_enabled: normalized.sms_enabled,
    p_staff_notification_enabled: normalized.staff_notification_enabled,
    p_customer_audience_enabled: normalized.customer_audience_enabled,
    p_staff_audience_enabled: normalized.staff_audience_enabled,
    p_owner_audience_enabled: normalized.owner_audience_enabled,
    p_channel_template_assignments: normalized.channel_template_assignments,
  });
  if (error) throw error;
  return normalizeNotificationPolicyDraft(Array.isArray(data) ? data[0] : data);
}
