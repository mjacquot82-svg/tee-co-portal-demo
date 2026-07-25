import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  listCurrentNotificationPolicies,
  saveNotificationPolicyVersion,
} from "../src/lib/notificationPolicyAdministration.js";

const migrationUrl = new URL(
  "../supabase/notification-engine-c4-authorization.sql",
  import.meta.url
);

async function readMigration() {
  return readFile(migrationUrl, "utf8");
}

test("C4 denies anonymous engine access and enables RLS on every canonical table", async () => {
  const migration = await readMigration();
  const tables = [
    "notification_business_events",
    "notification_template_versions",
    "notification_policies",
    "notifications",
    "notification_deliveries",
    "notification_delivery_attempts",
    "notification_delivery_status_history",
  ];

  for (const table of tables) {
    expect(migration).toContain(
      `alter table public.${table} enable row level security;`
    );
    expect(migration).toContain(
      `revoke all on table public.${table} from anon, authenticated;`
    );
    expect(migration).toContain(
      `grant all on table public.${table} to service_role;`
    );
  }

  expect(migration).toContain(
    "revoke all on table public.notification_engine_activity from anon, authenticated;"
  );
  expect(migration).toContain(
    "alter view public.notification_engine_activity set (security_invoker = true);"
  );
  expect(migration).toContain(
    "alter view public.notification_engine_cutover_verification set (security_invoker = true);"
  );
});

test("C4 policy administration requires immutable Owner metadata at the database boundary", async () => {
  const migration = await readMigration();

  expect(migration).toContain(
    "auth.jwt() -> 'app_metadata' ->> 'operational_role'"
  );
  expect(migration).not.toContain(
    "auth.jwt() -> 'user_metadata' ->> 'operational_role'"
  );
  expect(migration).toContain(
    "if not public.is_notification_engine_owner() then"
  );
  expect(migration).toContain("raise exception 'Owner authorization is required.'");
  expect(migration).toContain("using errcode = '42501'");
  expect(migration).toContain("v_updated_by := coalesce(auth.uid()::text, 'service_role');");
  expect(migration).toContain("v_updated_by");
  expect(migration).not.toContain("coalesce(trim(p_updated_by), '')");
  expect(migration).toContain(
    ") to authenticated, service_role;"
  );
});

test("C4 browser policy save cannot submit an impersonated audit identity", async () => {
  const calls = [];
  const savedPolicy = {
    event_type: "deposit_requested",
    version: 2,
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: false,
    staff_notification_enabled: false,
    customer_audience_enabled: true,
    staff_audience_enabled: false,
    owner_audience_enabled: false,
    channel_template_assignments: { email: "deposit_requested:v1" },
  };
  const client = {
    from() {},
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data: savedPolicy, error: null };
    },
  };

  await saveNotificationPolicyVersion(savedPolicy, {
    client,
    updatedBy: "impersonated-user",
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].name).toBe("save_notification_policy_version");
  expect(calls[0].parameters).not.toHaveProperty("p_updated_by");
});

test("C4 keeps policy reads available to authenticated operational UI clients", async () => {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return query;
    },
    async order(column, options) {
      calls.push(["order", column, options]);
      return { data: [], error: null };
    },
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };

  await expect(listCurrentNotificationPolicies(client)).resolves.toBeTruthy();
  expect(calls).toContainEqual(["from", "notification_policies"]);

  const migration = await readMigration();
  expect(migration).toContain(
    "grant select on table public.notification_policies to authenticated;"
  );
  expect(migration).toContain(
    "using (public.is_notification_engine_operational_user());"
  );
});

test("C4 reserves dispatcher and adapter execution for service_role", async () => {
  const migration = await readMigration();
  const privilegedFunctions = [
    "claim_notification_deliveries_observation",
    "recover_abandoned_notification_delivery_claims",
    "complete_notification_delivery_observation",
    "claim_staff_notification_deliveries_observation",
    "complete_staff_internal_delivery_observation",
    "claim_resend_email_deliveries_observation",
    "complete_resend_email_delivery_observation",
    "refresh_notification_aggregate_status",
    "mark_notification_delivery_delivered",
    "cancel_notification_delivery",
    "claim_resend_email_delivery_cutover",
    "complete_resend_email_delivery_cutover",
  ];

  for (const functionName of privilegedFunctions) {
    expect(migration).toContain(`'${functionName}'`);
  }
  expect(migration).toContain(
    "'revoke all privileges on function %s from public, anon, authenticated'"
  );
  expect(migration).toContain(
    "'grant execute on function %s to service_role'"
  );
  expect(migration).toContain(
    "status in ('queued', 'not_deliverable', 'suppressed')"
  );
  expect(migration).toContain("and attempt_count = 0");
  expect(migration).toContain("and claim_token = ''");
  expect(migration).toContain("and provider_message_id = ''");
});
