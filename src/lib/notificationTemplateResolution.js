import {
  buildPhase2ATemplateVersionSeed,
  NOTIFICATION_CHANNELS,
} from "./notificationEngineFoundation";
import {
  persistNotificationTemplateVersion,
} from "./notificationEngineRepository";
import { findPublishedNotificationTemplateVersion } from "./notificationEnginePhase2CRepository";
import { renderTemplateContent } from "./notificationTemplatesStore";

function enabledPolicyChannels(policy = {}) {
  return [
    policy.email_enabled && NOTIFICATION_CHANNELS.email,
    policy.sms_enabled && NOTIFICATION_CHANNELS.sms,
    policy.staff_notification_enabled && NOTIFICATION_CHANNELS.staff,
  ].filter(Boolean);
}

function normalizeRequiredFields(value) {
  return Array.isArray(value)
    ? value.map((field) => String(field || "").trim()).filter(Boolean)
    : [];
}

function buildChannelContent(channel, version, mergeContext) {
  if (channel === NOTIFICATION_CHANNELS.email) {
    return {
      subject: renderTemplateContent(version.email_subject, mergeContext),
      body: renderTemplateContent(version.email_body, mergeContext),
    };
  }
  if (channel === NOTIFICATION_CHANNELS.sms) {
    return {
      body: renderTemplateContent(version.sms_message, mergeContext),
    };
  }
  return {};
}

function rawChannelContents(channel, version) {
  if (channel === NOTIFICATION_CHANNELS.email) {
    return [version.email_subject, version.email_body];
  }
  if (channel === NOTIFICATION_CHANNELS.sms) {
    return [version.sms_message];
  }
  return [];
}

async function resolveVersion({
  channel,
  eventType,
  policy,
  legacyTemplate,
  client,
}) {
  const assignedVersionId =
    policy.channel_template_assignments?.[channel] || "";
  const existing = await findPublishedNotificationTemplateVersion({
    templateVersionId: assignedVersionId,
    templateType: assignedVersionId ? "" : eventType,
    client,
  });
  if (existing) return existing;

  if (!legacyTemplate) {
    throw new Error(
      `No published template version exists for ${eventType}/${channel}.`
    );
  }

  const fallback = buildPhase2ATemplateVersionSeed({
    ...legacyTemplate,
    type: eventType,
  });
  return persistNotificationTemplateVersion(fallback, client);
}

export async function resolvePublishedNotificationTemplates({
  eventType,
  policy,
  mergeContext,
  legacyTemplate,
  client,
}) {
  const channels = enabledPolicyChannels(policy);
  const snapshots = {};
  const requiredFields = new Set();
  const renderedContents = [];

  for (const channel of channels) {
    const version = await resolveVersion({
      channel,
      eventType,
      policy,
      legacyTemplate,
      client,
    });
    normalizeRequiredFields(version.required_merge_fields).forEach((field) =>
      requiredFields.add(field)
    );
    const content = buildChannelContent(channel, version, mergeContext);
    renderedContents.push(...Object.values(content));
    snapshots[channel] = {
      templateType: version.template_type,
      templateVersionId: version.id,
      templateVersion: version.version,
      content,
      rawMergeTokens: Array.from(
        new Set(
          rawChannelContents(channel, version).flatMap((value) =>
            Array.from(
              String(value || "").matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi)
            ).map((match) => match[1].trim())
          )
        )
      ),
    };
  }

  return {
    channels,
    snapshots,
    additionalRequiredFields: [...requiredFields],
    renderedContents,
  };
}

