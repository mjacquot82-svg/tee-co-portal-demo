import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  normalizeNotificationPolicyDraft,
  reconcileLegacyTriggerEventType,
  saveNotificationPolicyVersion,
  validateNotificationPolicyDraft,
} from "../src/lib/notificationPolicyAdministration.js";
import {
  canAccessProtectedManagementRoute,
  classifyAdminRoute,
} from "../src/admin/adminRoleView.js";

const templates = [{ type: "deposit_requested" }];

function policy(overrides = {}) {
  return normalizeNotificationPolicyDraft({
    event_type: "deposit_requested",
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: false,
    staff_notification_enabled: false,
    customer_audience_enabled: true,
    staff_audience_enabled: false,
    owner_audience_enabled: false,
    channel_template_assignments: { email: "deposit_requested:v1" },
    ...overrides,
  });
}

test("Phase 2H keeps policy, audiences, channels, and template assignment together", () => {
    expect(validateNotificationPolicyDraft(policy(), templates)).toEqual([]);
    expect(policy()).toMatchObject({
      enabled: true,
      delivery_mode: "automatic",
      customer_audience_enabled: true,
      email_enabled: true,
      channel_template_assignments: { email: "deposit_requested:v1" },
    });
});

test("Phase 2H rejects enabled channels without an assigned published template identity", () => {
    expect(validateNotificationPolicyDraft(policy({
      channel_template_assignments: { email: "" },
    }), templates)).toContain("email requires a template assignment.");
});

test("Phase 2H rejects enabled policies without an audience", () => {
    expect(validateNotificationPolicyDraft(policy({
      customer_audience_enabled: false,
    }), templates)).toContain("An enabled policy requires at least one audience.");
});

test("Phase 2H reconciles legacy trigger aliases into canonical event types", () => {
    expect(reconcileLegacyTriggerEventType("moved_to_production")).toBe("order_in_production");
    expect(reconcileLegacyTriggerEventType("ready_for_pickup")).toBe("order_ready_for_pickup");
    expect(reconcileLegacyTriggerEventType("deposit_requested")).toBe("deposit_requested");
});

test("Phase 2H policy and operational activity are Owner-only management routes", () => {
  const owner = { id: "owner-1", role: "owner", permissions: ["settings.manage"] };
  const manager = { id: "manager-1", role: "manager", permissions: ["settings.manage"] };
  for (const path of [
    "/admin/settings/notifications/policy",
    "/admin/settings/notifications/activity",
  ]) {
    expect(classifyAdminRoute(path).classification).toBe("protected-management");
    expect(canAccessProtectedManagementRoute(path, owner)).toBe(true);
    expect(canAccessProtectedManagementRoute(path, manager)).toBe(false);
  }
});

test("Phase 2H saves through the atomic policy-version RPC without changing runtime policy evaluation", async () => {
    const single = policy({ id: "policy:deposit_requested:v2", version: 2 });
    const calls = [];
    const rpc = async (...args) => {
      calls.push(args);
      return { data: single, error: null };
    };
    await expect(saveNotificationPolicyVersion(policy(), {
      client: { from() {}, rpc },
    })).resolves.toMatchObject({ version: 2 });
    expect(calls[0]).toEqual(["save_notification_policy_version", expect.objectContaining({
      p_event_type: "deposit_requested",
    })]);
    expect(calls[0][1]).not.toHaveProperty("p_updated_by");
});

test("Phase 2H keeps template editing content-only and adds delivery-aware activity", async () => {
    const [templatesPage, activityPage, migration] = await Promise.all([
      readFile(new URL("../src/admin/NotificationTemplates.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/admin/NotificationActivity.jsx", import.meta.url), "utf8"),
      readFile(new URL("../supabase/notification-engine-phase2h-owner-administration.sql", import.meta.url), "utf8"),
    ]);
    expect(templatesPage).not.toContain("Email Enabled");
    expect(templatesPage).not.toContain("Staff Notification Enabled");
    expect(templatesPage).toContain("Content only.");
    expect(activityPage).toContain("Provider message ID");
    expect(activityPage).toContain("Retry scheduled");
    expect(activityPage).toContain("Legacy activity record");
    expect(migration).toContain("save_notification_policy_version");
    expect(migration).toContain("notification_engine_activity");
});

test("Phase 2H does not introduce Phase 2I transport or scheduling behavior", async () => {
    const paths = [
      "../src/admin/NotificationPolicies.jsx",
      "../src/lib/notificationPolicyAdministration.js",
      "../src/lib/notificationActivityRepository.js",
      "../supabase/notification-engine-phase2h-owner-administration.sql",
    ];
    const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
    const combined = sources.join("\n");
    expect(combined).not.toContain("Twilio");
    expect(combined).not.toContain("setInterval");
    expect(combined).not.toContain("customer-notification");
    expect(combined).not.toContain("dispatch_notification");
});
