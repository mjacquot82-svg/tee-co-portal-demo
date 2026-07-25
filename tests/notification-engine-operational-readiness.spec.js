import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  listDeliveryAwareNotificationActivity,
  loadDeliveryAwareNotificationActivity,
} from "../src/lib/notificationActivityRepository.js";

function activityClient({ data = [], error = null } = {}) {
  return {
    from(table) {
      expect(table).toBe("notification_engine_activity");
      return {
        select() {
          return {
            order() {
              return {
                async limit() {
                  return { data, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("durable activity success is explicitly distinguishable from fallback", async () => {
  const result = await loadDeliveryAwareNotificationActivity({
    client: activityClient({
      data: [
        {
          notification_id: "notification-1",
          event_type: "quote_approved",
          subject_type: "order",
          subject_id: "TC-100",
          notification_status: "completed",
          aggregate_state: "completed",
          policy_snapshot: { version: 2 },
          notification_created_at: "2026-07-25T12:00:00.000Z",
          deliveries: [],
        },
      ],
    }),
  });
  expect(result).toMatchObject({
    durableActivityAvailable: true,
    durableActivityError: "",
  });
  expect(result.records[0]).toMatchObject({
    id: "notification-1",
    recordKind: "engine",
    aggregateState: "completed",
  });
});

test("durable activity failure remains visible while preserving legacy fallback", async () => {
  const result = await loadDeliveryAwareNotificationActivity({
    client: activityClient({
      error: new Error("notification_engine_activity is unavailable"),
    }),
  });
  expect(result.durableActivityAvailable).toBe(false);
  expect(result.durableActivityError).toContain(
    "notification_engine_activity is unavailable"
  );
  expect(Array.isArray(result.records)).toBe(true);

  const backwardCompatibleRows = await listDeliveryAwareNotificationActivity({
    client: activityClient({ error: new Error("unavailable") }),
  });
  expect(Array.isArray(backwardCompatibleRows)).toBe(true);
});

test("Activity UI presents an operational warning without removing fallback history", async () => {
  const source = await readFile("src/admin/NotificationActivity.jsx", "utf8");
  expect(source).toContain('role="alert"');
  expect(source).toContain(
    "Durable Notification Engine activity is unavailable."
  );
  expect(source).toContain("Legacy history is shown below.");
  expect(source).toContain("result.records");
});

test("cutover documentation enables server capability before Authoritative client mode", async () => {
  const plan = await readFile(
    "docs/testing/notification-engine-production-verification.md",
    "utf8"
  );
  const controlledActivation = plan.slice(
    plan.indexOf("### Controlled activation"),
    plan.indexOf("### Stop conditions")
  );
  expect(controlledActivation.indexOf("client in Verify mode")).toBeLessThan(
    controlledActivation.indexOf(
      "NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=true"
    )
  );
  expect(
    controlledActivation.indexOf(
      "NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=true"
    )
  ).toBeLessThan(
    controlledActivation.indexOf(
      "VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=authoritative"
    )
  );
  expect(controlledActivation).toContain(
    "Enabling Authoritative client mode while the server gate"
  );
});

test("canonical roadmap contains Phase 2A through Phase 2I and is not a verification-plan duplicate", async () => {
  const roadmap = await readFile(
    "docs/architecture/notification-engine-implementation-roadmap.md",
    "utf8"
  );
  for (const phase of [
    "2A",
    "2B",
    "2C",
    "2D",
    "2E",
    "2F",
    "2G",
    "2H",
    "2I",
  ]) {
    expect(roadmap).toContain(`## Phase ${phase}`);
  }
  expect(roadmap).toContain("## Architectural-area assessment");
  expect(roadmap).toContain("## Dependency sequence");
  expect(roadmap).not.toContain("# Notification Engine Production Verification Plan");
});
