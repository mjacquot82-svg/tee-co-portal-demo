import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";

const STORAGE_KEY = "teeCoCustomerNotificationTriggerConfig";

export const CUSTOMER_NOTIFICATION_CHANNELS = ["email", "sms", "portal"];

export const CUSTOMER_NOTIFICATION_TRIGGER_DEFINITIONS = [
  {
    eventType: "artwork_approved",
    label: "Artwork Approved",
    description: "Customer-facing approval milestone for artwork that is ready to proceed.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "artwork_revision_requested",
    label: "Artwork Revision Requested",
    description: "Request customer action when artwork requires updates before production.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "moved_to_production",
    label: "Moved To Production",
    description: "Workflow release event when a job moves into the production queue.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "production_started",
    label: "Production Started",
    description: "Progress notification once approved work begins operational execution.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "moved_to_printing",
    label: "Moved To Printing",
    description: "Execution-stage event when a production job enters the printing phase.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "moved_to_qc",
    label: "Moved To QC",
    description: "Checkpoint event when production work moves into QC and finishing.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "ready_for_pickup",
    label: "Ready For Pickup",
    description: "Pickup-ready customer alert once production work has cleared final handling.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "order_completed",
    label: "Order Completed",
    description: "Completion milestone after the production workflow has fully closed out.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "order_on_hold",
    label: "Order On Hold",
    description: "Hold-state event that can later inform customers about paused production work.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "resumed_from_hold",
    label: "Resumed From Hold",
    description: "Resume event when paused production work returns to active execution.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "deposit_requested",
    label: "Deposit Requested",
    description: "Payment request milestone before work advances further in the workflow.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
  {
    eventType: "deposit_received",
    label: "Deposit Received",
    description: "Deposit collection milestone that can later trigger customer-facing confirmation.",
    channels: CUSTOMER_NOTIFICATION_CHANNELS,
  },
];

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function buildDefaultTriggerConfig(definition) {
  return {
    eventType: definition.eventType,
    enabled: false,
    channels: definition.channels.reduce((channels, channel) => {
      channels[channel] = false;
      return channels;
    }, {}),
  };
}

function normalizeTriggerConfig(config = {}) {
  const defaultsByEventType = Object.fromEntries(
    CUSTOMER_NOTIFICATION_TRIGGER_DEFINITIONS.map((definition) => [
      definition.eventType,
      buildDefaultTriggerConfig(definition),
    ])
  );

  return Object.fromEntries(
    Object.values(defaultsByEventType).map((defaultConfig) => {
      const storedConfig = config[defaultConfig.eventType] || {};

      return [
        defaultConfig.eventType,
        {
          eventType: defaultConfig.eventType,
          enabled: normalizeBoolean(storedConfig.enabled, defaultConfig.enabled),
          channels: Object.fromEntries(
            CUSTOMER_NOTIFICATION_CHANNELS.map((channel) => [
              channel,
              normalizeBoolean(
                storedConfig.channels?.[channel],
                defaultConfig.channels[channel]
              ),
            ])
          ),
        },
      ];
    })
  );
}

export function getCustomerNotificationTriggerConfig() {
  if (!hasBrowserStorage()) {
    return normalizeTriggerConfig();
  }

  return normalizeTriggerConfig(getJsonStorageItem(STORAGE_KEY, {}));
}

export function saveCustomerNotificationTriggerConfig(config) {
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(STORAGE_KEY, normalizeTriggerConfig(config));
}

export function updateCustomerNotificationTriggerConfig(eventType, updates = {}) {
  const currentConfig = getCustomerNotificationTriggerConfig();
  const normalizedEventType = String(eventType || "").trim();

  if (!normalizedEventType || !currentConfig[normalizedEventType]) {
    throw new Error("A valid notification trigger event type is required.");
  }

  const nextConfig = {
    ...currentConfig,
    [normalizedEventType]: {
      ...currentConfig[normalizedEventType],
      enabled: normalizeBoolean(
        updates.enabled,
        currentConfig[normalizedEventType].enabled
      ),
      channels: {
        ...currentConfig[normalizedEventType].channels,
        ...Object.fromEntries(
          CUSTOMER_NOTIFICATION_CHANNELS.map((channel) => [
            channel,
            normalizeBoolean(
              updates.channels?.[channel],
              currentConfig[normalizedEventType].channels[channel]
            ),
          ])
        ),
      },
    },
  };

  if (!saveCustomerNotificationTriggerConfig(nextConfig)) {
    throw new Error("Unable to save notification trigger configuration.");
  }

  return nextConfig[normalizedEventType];
}
