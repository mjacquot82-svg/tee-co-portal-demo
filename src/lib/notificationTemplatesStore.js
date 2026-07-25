import { useSyncExternalStore } from "react";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoNotificationTemplates";
const VERSION_STORAGE_KEY = "teeCoNotificationTemplateVersions";
const SUPABASE_TABLE = "notification_templates";
const MIGRATION_SENTINEL_KEY = "teeCoNotificationTemplatesMigratedToSupabase";

// In-memory cache (null = not yet seeded)
let cachedTemplatesMap = null;
const templateListeners = new Set();

let templatesHydrationPromise = null;
let localTemplateVersions = [];

function shouldUseSupabase() {
  return Boolean(supabase?.from);
}

function setCachedTemplatesMap(templates) {
  cachedTemplatesMap = templates;
}

function emitTemplatesUpdated() {
  templateListeners.forEach((listener) => listener());
}

export function subscribeToNotificationTemplates(listener) {
  if (typeof listener !== "function") return () => {};
  templateListeners.add(listener);
  return () => templateListeners.delete(listener);
}

export const NOTIFICATION_TYPES = Object.freeze({
  newCustomerRequest: "new_customer_request",
  quoteReadyForApproval: "quote_ready_for_approval",
  quoteApproved: "quote_approved",
  artworkRevisionRequested: "artwork_revision_requested",
  artworkApproved: "artwork_approved",
  depositRequested: "deposit_requested",
  paymentRequestCreated: "payment_request_created",
  paymentReceived: "payment_received",
  paymentFailed: "payment_failed",
  orderInProduction: "order_in_production",
  orderReadyForPickup: "order_ready_for_pickup",
  orderCompleted: "order_completed",
});

export const NOTIFICATION_TYPE_LABELS = Object.freeze({
  [NOTIFICATION_TYPES.newCustomerRequest]: "New Customer Request",
  [NOTIFICATION_TYPES.quoteReadyForApproval]: "Quote Ready For Approval",
  [NOTIFICATION_TYPES.quoteApproved]: "Quote Approved",
  [NOTIFICATION_TYPES.artworkRevisionRequested]: "Artwork Revision Requested",
  [NOTIFICATION_TYPES.artworkApproved]: "Artwork Approved",
  [NOTIFICATION_TYPES.depositRequested]: "Deposit Requested",
  [NOTIFICATION_TYPES.paymentRequestCreated]: "Payment Request Created",
  [NOTIFICATION_TYPES.paymentReceived]: "Payment Received",
  [NOTIFICATION_TYPES.paymentFailed]: "Payment Failed",
  [NOTIFICATION_TYPES.orderInProduction]: "Order In Production",
  [NOTIFICATION_TYPES.orderReadyForPickup]: "Order Ready For Pickup",
  [NOTIFICATION_TYPES.orderCompleted]: "Order Completed",
});

export const MERGE_FIELDS = Object.freeze([
  { key: "{{customer_name}}", label: "Customer Name" },
  { key: "{{order_number}}", label: "Order Number" },
  { key: "{{quote_total}}", label: "Quote Total" },
  { key: "{{deposit_amount}}", label: "Deposit Amount" },
  { key: "{{balance_due}}", label: "Balance Due" },
  { key: "{{approval_link}}", label: "Approval Link" },
  { key: "{{payment_link}}", label: "Payment Link" },
  { key: "{{pickup_date}}", label: "Pickup Date" },
  { key: "{{company_name}}", label: "Company Name" },
]);

// Flat list of token names (without braces) for test compatibility
export const NOTIFICATION_MERGE_FIELDS = Object.freeze(
  MERGE_FIELDS.map((f) => f.key.replace(/[{}]/g, ""))
);

export const SAMPLE_MERGE_DATA = Object.freeze({
  "{{customer_name}}": "Jane Smith",
  "{{order_number}}": "ORD-2024-001",
  "{{quote_total}}": "$285.00",
  "{{deposit_amount}}": "$142.50",
  "{{balance_due}}": "$142.50",
  "{{approval_link}}": "https://teeandco.com/approval/ORD-2024-001",
  "{{payment_link}}": "https://teeandco.com/deposit/ORD-2024-001",
  "{{pickup_date}}": "July 15, 2024",
  "{{company_name}}": "Tee & Co",
});

// Flat sample data keyed by token name (without braces) for renderNotificationTemplatePreview
export const NOTIFICATION_TEMPLATE_SAMPLE_DATA = Object.freeze(
  Object.fromEntries(
    Object.entries(SAMPLE_MERGE_DATA).map(([k, v]) => [k.replace(/[{}]/g, ""), v])
  )
);

const DEFAULT_TEMPLATES = Object.freeze({
  [NOTIFICATION_TYPES.newCustomerRequest]: {
    type: NOTIFICATION_TYPES.newCustomerRequest,
    name: "New Customer Request",
    emailSubject: "We received your request, {{customer_name}}!",
    emailBody: `Hi {{customer_name}},

Thank you for reaching out to {{company_name}}! We've received your order request and our team will review it shortly.

We'll be in touch soon with a quote and next steps.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, we've received your request at {{company_name}} and will be in touch soon!",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  [NOTIFICATION_TYPES.quoteReadyForApproval]: {
    type: NOTIFICATION_TYPES.quoteReadyForApproval,
    name: "Quote Ready For Approval",
    emailSubject: "Your quote is ready for review — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Your quote for order {{order_number}} is ready for your review!

Quote Total: {{quote_total}}

Please review and approve your quote using the link below:
{{approval_link}}

If you have any questions, don't hesitate to reach out.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your quote for {{order_number}} is ready! Total: {{quote_total}}. Review here: {{approval_link}}",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.quoteApproved]: {
    type: NOTIFICATION_TYPES.quoteApproved,
    name: "Order Approved",
    emailSubject: "Your order has been approved",
    emailBody: `Hi {{customer_name}},

Your order {{order_number}} has been reviewed and approved by Tee & Co.

No action is required from you at this time.

We are preparing your order for the next stage and will notify you if anything is required or when your order is ready.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your order {{order_number}} has been approved. No action is required right now.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  [NOTIFICATION_TYPES.artworkRevisionRequested]: {
    type: NOTIFICATION_TYPES.artworkRevisionRequested,
    name: "Artwork Revision Requested",
    emailSubject: "Artwork revision needed — {{order_number}}",
    emailBody: `Hi {{customer_name}},

We've reviewed your artwork for order {{order_number}} and have a few revisions to discuss before we can proceed.

Please log in to your customer portal to review our feedback and upload updated artwork:
{{approval_link}}

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your artwork for order {{order_number}} needs a revision. Please check your portal: {{approval_link}}",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.artworkApproved]: {
    type: NOTIFICATION_TYPES.artworkApproved,
    name: "Artwork Approved",
    emailSubject: "Your artwork is approved — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Excellent news! Your artwork for order {{order_number}} has been approved and is ready for production.

We'll keep you updated as your order progresses.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your artwork for order {{order_number}} is approved and heading to production!",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.depositRequested]: {
    type: NOTIFICATION_TYPES.depositRequested,
    name: "Deposit Requested",
    emailSubject: "Deposit required to begin your order — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Your order {{order_number}} is ready to go into production once we receive your deposit.

Deposit Amount: {{deposit_amount}}

Please submit your deposit using the link below:
{{payment_link}}

Once your deposit is received, we'll get started right away!

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, deposit of {{deposit_amount}} required for order {{order_number}}. Pay here: {{payment_link}}",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.paymentRequestCreated]: {
    type: NOTIFICATION_TYPES.paymentRequestCreated,
    name: "Payment Request Created",
    emailSubject: "Payment request created — {{order_number}}",
    emailBody: `Hi {{customer_name}},

A new payment request has been created for order {{order_number}}.

Amount Requested: {{deposit_amount}}
Payment Link: {{payment_link}}

Please use the payment link when you're ready.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, a payment request for {{order_number}} is ready. Amount: {{deposit_amount}}. Pay here: {{payment_link}}",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  [NOTIFICATION_TYPES.paymentReceived]: {
    type: NOTIFICATION_TYPES.paymentReceived,
    name: "Payment Received",
    emailSubject: "Payment received — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Thank you! We've received your payment for order {{order_number}}.

Amount Paid: {{deposit_amount}}
Balance Due: {{balance_due}}

We'll keep you updated as your order progresses.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, payment received for order {{order_number}}. Balance due: {{balance_due}}. Thanks!",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  [NOTIFICATION_TYPES.paymentFailed]: {
    type: NOTIFICATION_TYPES.paymentFailed,
    name: "Payment Failed",
    emailSubject: "Payment could not be completed — {{order_number}}",
    emailBody: `Hi {{customer_name}},

We were unable to complete the payment for order {{order_number}}.

Amount: {{deposit_amount}}
Payment Link: {{payment_link}}

Please try again or contact Tee & Co if you have questions.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, payment for {{order_number}} could not be completed. Please try again: {{payment_link}}",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  [NOTIFICATION_TYPES.orderInProduction]: {
    type: NOTIFICATION_TYPES.orderInProduction,
    name: "Order In Production",
    emailSubject: "Your order is in production — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Your order {{order_number}} is now in production! Our team is working hard to bring your design to life.

We'll notify you when your order is ready for pickup.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your order {{order_number}} is now in production! We'll let you know when it's ready.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.orderReadyForPickup]: {
    type: NOTIFICATION_TYPES.orderReadyForPickup,
    name: "Order Ready For Pickup",
    emailSubject: "Your order is ready for pickup — {{order_number}}",
    emailBody: `Hi {{customer_name}},

Great news! Your order {{order_number}} is complete and ready for pickup.

Pickup Date: {{pickup_date}}
Balance Due: {{balance_due}}

Please bring your remaining balance when you come to pick up your order.

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your order {{order_number}} is ready for pickup on {{pickup_date}}! Balance due: {{balance_due}}.",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: false,
  },
  [NOTIFICATION_TYPES.orderCompleted]: {
    type: NOTIFICATION_TYPES.orderCompleted,
    name: "Order Completed",
    emailSubject: "Order complete — thank you, {{customer_name}}!",
    emailBody: `Hi {{customer_name}},

Thank you for choosing {{company_name}}! Your order {{order_number}} is now complete.

We hope you love your new gear. We'd love to see you again for your next order!

Thanks,
The {{company_name}} Team`,
    smsMessage: "Hi {{customer_name}}, your order {{order_number}} is complete. Thanks for choosing {{company_name}}!",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
});

// Array form of template definitions for test compatibility
export const NOTIFICATION_TEMPLATE_DEFINITIONS = Object.freeze(
  Object.values(DEFAULT_TEMPLATES).map((t) => ({
    type: t.type,
    label: NOTIFICATION_TYPE_LABELS[t.type],
    templateName: t.name,
    emailSubject: t.emailSubject,
    emailBody: t.emailBody,
    smsMessage: t.smsMessage,
    emailEnabled: t.emailEnabled,
    smsEnabled: t.smsEnabled,
    staffNotificationEnabled: t.staffNotificationEnabled,
  }))
);

export function applyMergeFields(text, data = SAMPLE_MERGE_DATA) {
  if (!text) return "";
  return MERGE_FIELDS.reduce((result, field) => {
    const value = data[field.key] ?? field.key;
    return result.split(field.key).join(value);
  }, text);
}

// Replace {{token}} placeholders using a flat key→value map (tokens without braces)
export function renderTemplateContent(templateContent = "", mergeFields = {}) {
  return String(templateContent || "").replace(
    /{{\s*([a-z0-9_]+)\s*}}/gi,
    (matchedText, token) => {
      const normalizedToken = String(token || "").trim();
      if (!normalizedToken || mergeFields?.[normalizedToken] == null) {
        return matchedText;
      }
      return String(mergeFields[normalizedToken]);
    }
  );
}

function normalizeTemplate(stored = {}, defaultTemplate = {}) {
  return {
    type: defaultTemplate.type,
    name: typeof stored.name === "string" ? stored.name : defaultTemplate.name,
    emailSubject:
      typeof stored.emailSubject === "string"
        ? stored.emailSubject
        : defaultTemplate.emailSubject,
    emailBody:
      typeof stored.emailBody === "string"
        ? stored.emailBody
        : defaultTemplate.emailBody,
    smsMessage:
      typeof stored.smsMessage === "string"
        ? stored.smsMessage
        : defaultTemplate.smsMessage,
    emailEnabled:
      typeof stored.emailEnabled === "boolean"
        ? stored.emailEnabled
        : defaultTemplate.emailEnabled,
    smsEnabled:
      typeof stored.smsEnabled === "boolean"
        ? stored.smsEnabled
        : defaultTemplate.smsEnabled,
    staffNotificationEnabled:
      typeof stored.staffNotificationEnabled === "boolean"
        ? stored.staffNotificationEnabled
        : defaultTemplate.staffNotificationEnabled,
  };
}

function normalizeAllTemplates(stored = {}) {
  return Object.fromEntries(
    Object.values(NOTIFICATION_TYPES).map((type) => [
      type,
      normalizeTemplate(stored[type] || {}, DEFAULT_TEMPLATES[type]),
    ])
  );
}

export function getNotificationTemplates() {
  // Return in-memory cache if seeded (by hydration or prior save)
  if (cachedTemplatesMap !== null) {
    return cachedTemplatesMap;
  }

  // Seed from localStorage on first synchronous call
  const localData = hasBrowserStorage() ? getJsonStorageItem(STORAGE_KEY, {}) : {};
  const normalized = normalizeAllTemplates(localData);
  cachedTemplatesMap = normalized;
  return normalized;
}

export function buildDefaultNotificationTemplates() {
  return NOTIFICATION_TEMPLATE_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function listNotificationTemplates() {
  const templatesMap = getNotificationTemplates();
  return Object.values(NOTIFICATION_TYPES).map((type) => {
    const t = templatesMap[type];
    return {
      type: t.type,
      label: NOTIFICATION_TYPE_LABELS[t.type],
      templateName: t.name,
      emailSubject: t.emailSubject,
      emailBody: t.emailBody,
      smsMessage: t.smsMessage,
      emailEnabled: t.emailEnabled,
      smsEnabled: t.smsEnabled,
      staffNotificationEnabled: t.staffNotificationEnabled,
    };
  });
}

// --- Supabase persistence helpers ---

function buildTemplateRow(template) {
  return {
    type: template.type,
    name: template.name || "",
    email_subject: template.emailSubject || "",
    email_body: template.emailBody || "",
    sms_message: template.smsMessage || "",
    email_enabled: Boolean(template.emailEnabled),
    sms_enabled: Boolean(template.smsEnabled),
    staff_notification_enabled: Boolean(template.staffNotificationEnabled),
  };
}

function mapTemplateRow(row) {
  return {
    type: row.type,
    name: row.name,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    smsMessage: row.sms_message,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    staffNotificationEnabled: row.staff_notification_enabled,
  };
}

async function persistTemplatesToSupabase(normalizedMap) {
  if (!shouldUseSupabase()) return;
  const rows = Object.values(normalizedMap).map(buildTemplateRow);
  try {
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(rows, { onConflict: "type" });
    if (error) {
      console.error("[notificationTemplatesStore] Supabase upsert failed", error);
    }
  } catch (err) {
    console.error("[notificationTemplatesStore] Supabase upsert threw", err);
  }
}

export function saveNotificationTemplates(templates) {
  const normalized = normalizeAllTemplates(templates);

  // Update in-memory cache immediately
  setCachedTemplatesMap(normalized);
  emitTemplatesUpdated();

  // Persist to localStorage
  const localSaved = hasBrowserStorage() ? setJsonStorageItem(STORAGE_KEY, normalized) : false;

  // Persist to Supabase async (fire-and-forget)
  if (shouldUseSupabase()) {
    persistTemplatesToSupabase(normalized);
  }

  return localSaved || shouldUseSupabase();
}

function buildVersionRpcParameters(template, status, requiredMergeFields) {
  return {
    p_template_type: template.type,
    p_name: template.name || "",
    p_email_subject: template.emailSubject || "",
    p_email_body: template.emailBody || "",
    p_sms_message: template.smsMessage || "",
    p_status: status,
    p_required_merge_fields: Array.isArray(requiredMergeFields)
      ? requiredMergeFields
      : [],
  };
}

function saveLocalTemplateVersion(template, status, requiredMergeFields) {
  const storedVersions = hasBrowserStorage()
    ? getJsonStorageItem(VERSION_STORAGE_KEY, [])
    : localTemplateVersions;
  const versions = Array.isArray(storedVersions) ? storedVersions : [];
  const version =
    versions
      .filter((entry) => entry.template_type === template.type)
      .reduce((highest, entry) => Math.max(highest, Number(entry.version) || 0), 0) + 1;
  const timestamp = new Date().toISOString();
  const row = {
    id: `${template.type}:v${version}`,
    template_type: template.type,
    version,
    name: template.name || "",
    email_subject: template.emailSubject || "",
    email_body: template.emailBody || "",
    sms_message: template.smsMessage || "",
    required_merge_fields: Array.isArray(requiredMergeFields)
      ? [...requiredMergeFields]
      : [],
    status,
    published_at: status === "published" ? timestamp : null,
    published_by: status === "published" ? "local_editor" : "",
    created_at: timestamp,
  };
  localTemplateVersions = [...versions, row];
  if (hasBrowserStorage()) {
    setJsonStorageItem(VERSION_STORAGE_KEY, localTemplateVersions);
  }
  return row;
}

export async function saveNotificationTemplateVersion(
  template,
  { status = "published", requiredMergeFields = [], client } = {}
) {
  const normalizedStatus = String(status || "published").trim().toLowerCase();
  if (!["draft", "published"].includes(normalizedStatus)) {
    throw new Error("Template status must be draft or published.");
  }
  const resolvedClient = client || supabase;
  if (!resolvedClient?.rpc) {
    return saveLocalTemplateVersion(
      template,
      normalizedStatus,
      requiredMergeFields
    );
  }
  const { data, error } = await resolvedClient.rpc(
    "save_notification_template_version",
    buildVersionRpcParameters(
      template,
      normalizedStatus,
      requiredMergeFields
    )
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// --- Supabase hydration + localStorage migration ---

async function hydrateNotificationTemplatesFromSupabase() {
  if (!shouldUseSupabase()) return;

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("type, name, email_subject, email_body, sms_message, email_enabled, sms_enabled, staff_notification_enabled");

    if (error) {
      console.warn("[notificationTemplatesStore] Supabase hydration failed", error);
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    // One-time migration: if Supabase has no rows and localStorage has customized templates
    const alreadyMigrated = hasBrowserStorage()
      ? getJsonStorageItem(MIGRATION_SENTINEL_KEY, false)
      : false;

    if (!alreadyMigrated && rows.length === 0) {
      const localData = hasBrowserStorage() ? getJsonStorageItem(STORAGE_KEY, {}) : {};
      const hasLocalCustomizations = Object.keys(localData).length > 0;
      if (hasLocalCustomizations) {
        console.info("[notificationTemplatesStore] Migrating localStorage templates to Supabase");
        const normalized = normalizeAllTemplates(localData);
        await persistTemplatesToSupabase(normalized);
        if (hasBrowserStorage()) {
          setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
        }
        setCachedTemplatesMap(normalized);
        emitTemplatesUpdated();
        return;
      }
    }

    // Mark migration as complete (even if there was nothing to migrate)
    if (!alreadyMigrated && hasBrowserStorage()) {
      setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
    }

    if (rows.length > 0) {
      // Build a map from Supabase rows, falling back to defaults for any missing type
      const remoteMap = Object.fromEntries(rows.map((row) => [row.type, mapTemplateRow(row)]));
      const normalized = normalizeAllTemplates(remoteMap);
      // Also keep localStorage in sync as a local cache
      if (hasBrowserStorage()) {
        setJsonStorageItem(STORAGE_KEY, normalized);
      }
      setCachedTemplatesMap(normalized);
      emitTemplatesUpdated();
    }
  } catch (err) {
    console.error("[notificationTemplatesStore] Supabase hydration threw", err);
  }
}

export function ensureNotificationTemplatesHydrated() {
  if (templatesHydrationPromise) return templatesHydrationPromise;
  templatesHydrationPromise = hydrateNotificationTemplatesFromSupabase().catch((err) => {
    console.error("[notificationTemplatesStore] Hydration promise rejected", err);
  });
  return templatesHydrationPromise;
}

// --- React hook ---

export function useNotificationTemplates() {
  return useSyncExternalStore(
    subscribeToNotificationTemplates,
    getNotificationTemplates,
    getNotificationTemplates
  );
}

export async function updateNotificationTemplate(type, updates = {}, options = {}) {
  const current = getNotificationTemplates();
  const normalizedType = String(type || "").trim();

  if (!normalizedType || !current[normalizedType]) {
    throw new Error("A valid notification template type is required.");
  }

  const updatedTemplate = normalizeTemplate(
    { ...current[normalizedType], ...updates },
    DEFAULT_TEMPLATES[normalizedType]
  );
  await saveNotificationTemplateVersion(updatedTemplate, options);

  if (String(options.status || "published").toLowerCase() === "draft") {
    return updatedTemplate;
  }

  const next = { ...current, [normalizedType]: updatedTemplate };
  setCachedTemplatesMap(next);
  emitTemplatesUpdated();
  if (hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, next);
  }
  return updatedTemplate;
}

export async function resetNotificationTemplate(type, options = {}) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType || !DEFAULT_TEMPLATES[normalizedType]) {
    throw new Error("A valid notification template type is required.");
  }
  return updateNotificationTemplate(
    normalizedType,
    DEFAULT_TEMPLATES[normalizedType],
    options
  );
}

export async function resetNotificationTemplatesToDefaults() {
  for (const type of Object.values(NOTIFICATION_TYPES)) {
    await updateNotificationTemplate(type, DEFAULT_TEMPLATES[type]);
  }
  return listNotificationTemplates();
}

export function renderNotificationTemplatePreview(template, mergeFields = {}) {
  const resolvedTemplate =
    typeof template === "string"
      ? listNotificationTemplates().find((item) => item.type === template)
      : template;

  if (!resolvedTemplate) {
    throw new Error("A valid notification template is required.");
  }

  const previewData = {
    ...NOTIFICATION_TEMPLATE_SAMPLE_DATA,
    ...(mergeFields && typeof mergeFields === "object" ? mergeFields : {}),
  };

  return {
    emailSubject: renderTemplateContent(resolvedTemplate.emailSubject, previewData),
    emailBody: renderTemplateContent(resolvedTemplate.emailBody, previewData),
    smsMessage: renderTemplateContent(resolvedTemplate.smsMessage, previewData),
  };
}
