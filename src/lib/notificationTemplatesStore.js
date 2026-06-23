import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";

const STORAGE_KEY = "teeCoNotificationTemplates";

export const NOTIFICATION_MERGE_FIELDS = Object.freeze([
  "customer_name",
  "order_number",
  "quote_total",
  "deposit_amount",
  "balance_due",
  "approval_link",
  "payment_link",
  "pickup_date",
  "company_name",
]);

export const NOTIFICATION_TEMPLATE_SAMPLE_DATA = Object.freeze({
  customer_name: "Jordan Smith",
  order_number: "TC-24037",
  quote_total: "$1,250.00",
  deposit_amount: "$625.00",
  balance_due: "$625.00",
  approval_link: "https://portal.teeandco.com/approval/TC-24037",
  payment_link: "https://portal.teeandco.com/payments/TC-24037",
  pickup_date: "2026-07-05",
  company_name: "Tee & Co",
});

export const NOTIFICATION_TEMPLATE_DEFINITIONS = Object.freeze([
  {
    type: "new_customer_request",
    label: "New Customer Request",
    templateName: "New Customer Request",
    emailSubject: "New request received: {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nThanks for your order request with {{company_name}}. We are reviewing request {{order_number}} now and will share your quote shortly.",
    smsMessage:
      "Hi {{customer_name}}, we received request {{order_number}} at {{company_name}} and are preparing your quote.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  {
    type: "quote_ready_for_approval",
    label: "Quote Ready For Approval",
    templateName: "Quote Ready For Approval",
    emailSubject: "Quote ready for approval: {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nYour quote for order {{order_number}} is ready. Total quoted amount: {{quote_total}}.\n\nReview and approve here: {{approval_link}}",
    smsMessage:
      "Your quote for {{order_number}} is ready. Review and approve: {{approval_link}}",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: true,
  },
  {
    type: "quote_approved",
    label: "Quote Approved",
    templateName: "Quote Approved",
    emailSubject: "Quote approved: {{order_number}}",
    emailBody:
      "Great news {{customer_name}}!\n\nYour quote for {{order_number}} has been approved. We will notify you as production milestones are reached.",
    smsMessage:
      "Thanks {{customer_name}}! Quote for {{order_number}} is approved. We will keep you updated.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  {
    type: "artwork_revision_requested",
    label: "Artwork Revision Requested",
    templateName: "Artwork Revision Requested",
    emailSubject: "Artwork revision requested for {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nA revision is requested for artwork on order {{order_number}}. Please review and submit updates so we can continue.",
    smsMessage:
      "Artwork revision requested for {{order_number}}. Please review and submit your update.",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: true,
  },
  {
    type: "artwork_approved",
    label: "Artwork Approved",
    templateName: "Artwork Approved",
    emailSubject: "Artwork approved for {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nArtwork for order {{order_number}} is approved. We are now moving your order to the next production step.",
    smsMessage:
      "Artwork approved for {{order_number}}. We are moving your order forward.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  {
    type: "deposit_requested",
    label: "Deposit Requested",
    templateName: "Deposit Requested",
    emailSubject: "Deposit requested for {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nA deposit of {{deposit_amount}} is required to begin work on {{order_number}}.\n\nPay securely: {{payment_link}}",
    smsMessage:
      "Deposit requested for {{order_number}}: {{deposit_amount}}. Pay here: {{payment_link}}",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: true,
  },
  {
    type: "payment_received",
    label: "Payment Received",
    templateName: "Payment Received",
    emailSubject: "Payment received for {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nWe received your payment for {{order_number}}.\nRemaining balance due: {{balance_due}}.",
    smsMessage:
      "Payment received for {{order_number}}. Remaining balance: {{balance_due}}.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: true,
  },
  {
    type: "order_in_production",
    label: "Order In Production",
    templateName: "Order In Production",
    emailSubject: "Order in production: {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nOrder {{order_number}} is now in production at {{company_name}}. We will notify you when it is ready for pickup.",
    smsMessage:
      "Order {{order_number}} is now in production at {{company_name}}.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
  {
    type: "order_ready_for_pickup",
    label: "Order Ready For Pickup",
    templateName: "Order Ready For Pickup",
    emailSubject: "Order ready for pickup: {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nOrder {{order_number}} is ready for pickup.\nPickup date: {{pickup_date}}.",
    smsMessage:
      "Order {{order_number}} is ready for pickup. Pickup date: {{pickup_date}}.",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: true,
  },
  {
    type: "order_completed",
    label: "Order Completed",
    templateName: "Order Completed",
    emailSubject: "Order completed: {{order_number}}",
    emailBody:
      "Hi {{customer_name}},\n\nOrder {{order_number}} has been completed. Thank you for choosing {{company_name}}.",
    smsMessage:
      "Order {{order_number}} is completed. Thank you for choosing {{company_name}}.",
    emailEnabled: true,
    smsEnabled: false,
    staffNotificationEnabled: false,
  },
]);

function normalizeText(value, fallbackValue = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallbackValue;
}

function normalizeBoolean(value, fallbackValue = false) {
  return typeof value === "boolean" ? value : fallbackValue;
}

function buildDefaultTemplate(definition) {
  return {
    type: definition.type,
    label: definition.label,
    templateName: definition.templateName,
    emailSubject: definition.emailSubject,
    emailBody: definition.emailBody,
    smsMessage: definition.smsMessage,
    emailEnabled: definition.emailEnabled,
    smsEnabled: definition.smsEnabled,
    staffNotificationEnabled: definition.staffNotificationEnabled,
  };
}

function normalizeTemplate(template = {}, definition) {
  const defaults = buildDefaultTemplate(definition);

  return {
    ...defaults,
    templateName: normalizeText(template.templateName, defaults.templateName),
    emailSubject: normalizeText(template.emailSubject, defaults.emailSubject),
    emailBody: normalizeText(template.emailBody, defaults.emailBody),
    smsMessage: normalizeText(template.smsMessage, defaults.smsMessage),
    emailEnabled: normalizeBoolean(template.emailEnabled, defaults.emailEnabled),
    smsEnabled: normalizeBoolean(template.smsEnabled, defaults.smsEnabled),
    staffNotificationEnabled: normalizeBoolean(
      template.staffNotificationEnabled,
      defaults.staffNotificationEnabled
    ),
  };
}

export function buildDefaultNotificationTemplates() {
  return NOTIFICATION_TEMPLATE_DEFINITIONS.map((definition) =>
    buildDefaultTemplate(definition)
  );
}

function normalizeTemplateList(templates = []) {
  const templatesByType = Object.fromEntries(
    (Array.isArray(templates) ? templates : [])
      .map((template) => [String(template?.type || "").trim(), template])
      .filter(([type]) => Boolean(type))
  );

  return NOTIFICATION_TEMPLATE_DEFINITIONS.map((definition) =>
    normalizeTemplate(templatesByType[definition.type], definition)
  );
}

export function listNotificationTemplates() {
  if (!hasBrowserStorage()) {
    return buildDefaultNotificationTemplates();
  }

  return normalizeTemplateList(getJsonStorageItem(STORAGE_KEY, []));
}

export function saveNotificationTemplates(templates = []) {
  const normalizedTemplates = normalizeTemplateList(templates);
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(STORAGE_KEY, normalizedTemplates);
}

export function updateNotificationTemplate(templateType, updates = {}) {
  const normalizedTemplateType = String(templateType || "").trim();
  const currentTemplates = listNotificationTemplates();
  const matchingTemplate = currentTemplates.find(
    (template) => template.type === normalizedTemplateType
  );

  if (!matchingTemplate) {
    throw new Error("A valid notification template type is required.");
  }

  const nextTemplates = currentTemplates.map((template) =>
    template.type === normalizedTemplateType
      ? normalizeTemplate({ ...template, ...updates }, template)
      : template
  );

  if (!saveNotificationTemplates(nextTemplates)) {
    throw new Error("Unable to save notification template updates.");
  }

  return nextTemplates.find((template) => template.type === normalizedTemplateType);
}

export function resetNotificationTemplatesToDefaults() {
  const defaults = buildDefaultNotificationTemplates();
  if (!saveNotificationTemplates(defaults)) {
    throw new Error("Unable to reset notification templates.");
  }
  return defaults;
}

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
