import { persistNotificationBusinessEvent } from "./notificationEngineRepository";

const DEFAULT_ACCEPTANCE_ENDPOINT =
  "/.netlify/functions/notification-event-accept";

function resolveEndpoint() {
  return (
    String(
      import.meta.env?.VITE_NOTIFICATION_EVENT_ACCEPTANCE_ENDPOINT || ""
    ).trim() || DEFAULT_ACCEPTANCE_ENDPOINT
  );
}

export async function acceptNotificationBusinessEventDurably(
  businessEventRow,
  { client, fetchImpl = globalThis.fetch } = {}
) {
  if (client) {
    return persistNotificationBusinessEvent(businessEventRow, client);
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Durable Notification Business Event acceptance is unavailable.");
  }

  const response = await fetchImpl(resolveEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessEvent: businessEventRow }),
    keepalive: true,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.businessEvent) {
    throw new Error(
      result.error ||
        `Notification Business Event acceptance failed with ${response.status}.`
    );
  }
  return result.businessEvent;
}
