import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/notification-engine-c7-policy-administration-authorization.sql",
  import.meta.url
);

async function readMigration() {
  return readFile(migrationUrl, "utf8");
}

test("C7 restores authenticated policy administration reads behind operational RLS", async () => {
  const migration = await readMigration();

  for (const table of [
    "notification_policies",
    "notification_template_versions",
  ]) {
    expect(migration).toContain(
      `alter table public.${table} enable row level security;`
    );
    expect(migration).toContain(
      `revoke all on table public.${table} from anon;`
    );
    expect(migration).toContain(
      `grant select on table public.${table} to authenticated;`
    );
  }

  expect(migration).toContain(
    "using (public.is_notification_engine_operational_user());"
  );
  expect(migration).not.toMatch(/grant\s+select[\s\S]*\bto\s+anon\b/i);
});

test("C7 retains Owner-only policy writes and denies anonymous RPC execution", async () => {
  const migration = await readMigration();

  expect(migration).toContain(
    "revoke all on function public.is_notification_engine_owner()"
  );
  expect(migration).toContain("from public, anon;");
  expect(migration).toContain(
    "grant execute on function public.save_notification_policy_version("
  );
  expect(migration).toContain(") to authenticated, service_role;");
  expect(migration).not.toMatch(
    /grant execute on function public\.save_notification_policy_version\([\s\S]*\)\s+to\s+anon/i
  );
});

test("C7 does not change Notification Engine runtime or provider functions", async () => {
  const migration = await readMigration();

  expect(migration).not.toMatch(
    /\b(notification_business_events|notifications|notification_deliveries|notification_delivery_attempts|twilio|resend)\b/i
  );
  expect(migration).not.toMatch(/\b(insert into|update|delete from)\b/i);
});
