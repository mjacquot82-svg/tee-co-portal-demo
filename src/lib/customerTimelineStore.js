import { useSyncExternalStore } from "react";
import {
  getAuthenticatedCustomerSession,
  getOperationalAuthUser,
} from "./operationalAuthStore";
import {
  getRawStorageItem,
  hasBrowserStorage,
  removeStorageItem,
  setRawStorageItem,
} from "./browserStorage";
import { customerIdsEqual, normalizeCustomerId } from "./customerIds";
import { getActiveStaffUser } from "./staffUsersStore";

const STORAGE_KEY = "teeCoCustomerOperationalTimeline";
const MAX_EVENTS = 2000;
const EMPTY_EVENTS = [];
const timelineListeners = new Set();

let cachedTimelineRaw = null;
let cachedTimelineSnapshot = EMPTY_EVENTS;

function buildTimelineEventId() {
  return `customer-timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeActor(actor = {}) {
  const name = String(
    actor.name ||
      actor.label ||
      actor.displayName ||
      actor.email ||
      actor.staff_name ||
      actor.actor_name ||
      ""
  ).trim();
  const role = String(actor.role || actor.staff_role || "").trim();
  const type = String(actor.type || actor.actor_type || "").trim();

  return {
    id: String(actor.id || actor.staff_id || actor.actor_id || "").trim(),
    name,
    role,
    type,
    email: String(actor.email || "").trim(),
    label: role && name ? `${name} (${role})` : name || role || "",
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function normalizeCustomerTimelineEvent(event = {}) {
  const actor = normalizeActor(
    event.actor || {
      id: event.actor_id || event.staff_id,
      name: event.actor_name || event.staff_name,
      role: event.actor_role || event.staff_role,
      type: event.actor_type || "staff",
      email: event.actor_email,
    }
  );

  return {
    id: String(event.id || "").trim() || buildTimelineEventId(),
    customerId: normalizeCustomerId(event.customerId || event.customer_id),
    eventType:
      String(event.eventType || event.event_type || "customer_updated").trim() ||
      "customer_updated",
    timestamp:
      String(event.timestamp || event.created_at || event.updated_at || "").trim() ||
      new Date().toISOString(),
    actor,
    summary:
      String(event.summary || event.note || "Operational activity recorded.").trim() ||
      "Operational activity recorded.",
    metadata: normalizeMetadata(event.metadata),
  };
}

function emitTimelineUpdated() {
  timelineListeners.forEach((listener) => listener());
}

function sortTimelineEvents(events = []) {
  return [...events].sort(
    (left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime()
  );
}

function readStoredTimelineEvents() {
  if (!hasBrowserStorage()) return EMPTY_EVENTS;

  try {
    const rawEvents = getRawStorageItem(STORAGE_KEY);
    const normalizedRawEvents = rawEvents || "";

    if (normalizedRawEvents === cachedTimelineRaw) {
      return cachedTimelineSnapshot;
    }

    const parsedEvents = rawEvents ? JSON.parse(rawEvents) : [];
    cachedTimelineRaw = normalizedRawEvents;
    cachedTimelineSnapshot = Array.isArray(parsedEvents)
      ? sortTimelineEvents(parsedEvents.map((event) => normalizeCustomerTimelineEvent(event)))
      : EMPTY_EVENTS;

    return cachedTimelineSnapshot;
  } catch (error) {
    console.error("Unable to read customer operational timeline", error);
    cachedTimelineRaw = null;
    cachedTimelineSnapshot = EMPTY_EVENTS;
    return EMPTY_EVENTS;
  }
}

function saveTimelineEvents(events) {
  if (!hasBrowserStorage()) return false;

  const normalizedEvents = sortTimelineEvents(
    (Array.isArray(events) ? events : []).map((event) => normalizeCustomerTimelineEvent(event))
  ).slice(0, MAX_EVENTS);

  const saved = setRawStorageItem(STORAGE_KEY, JSON.stringify(normalizedEvents));
  if (!saved) return false;

  cachedTimelineRaw = JSON.stringify(normalizedEvents);
  cachedTimelineSnapshot = normalizedEvents;
  emitTimelineUpdated();
  return true;
}

export function saveCustomerTimelineEvents(events) {
  return saveTimelineEvents(events);
}

function resolveDefaultActor() {
  const activeStaffUser = getActiveStaffUser();
  if (activeStaffUser?.id || activeStaffUser?.name) {
    return {
      id: activeStaffUser.id,
      name: activeStaffUser.name,
      role: activeStaffUser.role,
      type: "staff",
      email: activeStaffUser.email || "",
    };
  }

  const operationalAuthUser = getOperationalAuthUser();
  if (operationalAuthUser?.id || operationalAuthUser?.name) {
    return {
      id: operationalAuthUser.id,
      name: operationalAuthUser.name,
      role: operationalAuthUser.role,
      type: "staff",
      email: operationalAuthUser.email || "",
    };
  }

  const customerSession = getAuthenticatedCustomerSession();
  if (customerSession?.id || customerSession?.displayName) {
    return {
      id: customerSession.id,
      name: customerSession.displayName,
      type: "customer",
      email: customerSession.email || "",
    };
  }

  return {};
}

export function listCustomerTimelineEvents() {
  return readStoredTimelineEvents();
}

export function addCustomerTimelineEvent(customerId, eventInput = {}) {
  const normalizedCustomerId = normalizeCustomerId(customerId || eventInput.customerId);

  if (!normalizedCustomerId) {
    throw new Error("A customerId is required to add a customer timeline event.");
  }

  const nextEvent = normalizeCustomerTimelineEvent({
    ...eventInput,
    customerId: normalizedCustomerId,
    actor: eventInput.actor || resolveDefaultActor(),
  });
  const currentEvents = listCustomerTimelineEvents();

  if (!saveTimelineEvents([nextEvent, ...currentEvents])) {
    throw new Error("Unable to save customer timeline event. Browser storage write failed.");
  }

  return nextEvent;
}

export function getCustomerTimeline(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  return listCustomerTimelineEvents().filter((event) =>
    customerIdsEqual(event.customerId, normalizedCustomerId)
  );
}

export function deleteCustomerTimelineEvent(customerId, eventId) {
  const normalizedEventId = String(eventId || "").trim();
  const normalizedCustomerId = normalizeCustomerId(customerId);

  if (!normalizedEventId) return false;

  const currentEvents = listCustomerTimelineEvents();
  const nextEvents = currentEvents.filter((event) => {
    if (event.id !== normalizedEventId) return true;
    if (!normalizedCustomerId) return false;
    return !customerIdsEqual(event.customerId, normalizedCustomerId);
  });

  if (nextEvents.length === currentEvents.length) {
    return false;
  }

  if (!nextEvents.length) {
    const removed = removeStorageItem(STORAGE_KEY);
    if (!removed) return false;
    cachedTimelineRaw = "";
    cachedTimelineSnapshot = EMPTY_EVENTS;
    emitTimelineUpdated();
    return true;
  }

  return saveTimelineEvents(nextEvents);
}

export function addOperationalTimelineEvent(eventInput = {}) {
  return addCustomerTimelineEvent(eventInput.customerId, eventInput);
}

export function getOperationalTimelineEvents(customerId) {
  return getCustomerTimeline(customerId);
}

export function deleteOperationalTimelineEvent(customerId, eventId) {
  return deleteCustomerTimelineEvent(customerId, eventId);
}

export function subscribeToCustomerTimeline(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  timelineListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      timelineListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      cachedTimelineRaw = null;
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    timelineListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useCustomerTimeline(customerId) {
  const timelineEvents = useSyncExternalStore(
    subscribeToCustomerTimeline,
    listCustomerTimelineEvents,
    () => EMPTY_EVENTS
  );
  const normalizedCustomerId = normalizeCustomerId(customerId);

  if (!normalizedCustomerId) return EMPTY_EVENTS;
  return timelineEvents.filter((event) => customerIdsEqual(event.customerId, normalizedCustomerId));
}
