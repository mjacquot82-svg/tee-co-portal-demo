import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildDefaultNotificationTemplates,
  saveNotificationTemplateVersion,
  updateNotificationTemplate,
  resetNotificationTemplate,
} from "../src/lib/notificationTemplatesStore.js";
import { resolvePublishedNotificationTemplates } from "../src/lib/notificationTemplateResolution.js";

function createTemplateClient(seedVersions = []) {
  const versions = seedVersions.map((version) => ({ ...version }));
  const calls = [];
  return {
    versions,
    calls,
    client: {
      async rpc(name, parameters) {
        calls.push([name, parameters]);
        const version =
          versions
            .filter(
              (entry) =>
                entry.template_type === parameters.p_template_type
            )
            .reduce(
              (highest, entry) =>
                Math.max(highest, Number(entry.version) || 0),
              0
            ) + 1;
        const row = {
          id: `${parameters.p_template_type}:v${version}`,
          template_type: parameters.p_template_type,
          version,
          name: parameters.p_name,
          email_subject: parameters.p_email_subject,
          email_body: parameters.p_email_body,
          sms_message: parameters.p_sms_message,
          required_merge_fields: parameters.p_required_merge_fields,
          status: parameters.p_status,
          published_at:
            parameters.p_status === "published"
              ? "2026-07-25T12:00:00.000Z"
              : null,
        };
        versions.push(row);
        return { data: row, error: null };
      },
      from(table) {
        expect(table).toBe("notification_template_versions");
        let rows = [...versions];
        const query = {
          select() {
            return query;
          },
          eq(column, value) {
            rows = rows.filter((row) => row[column] === value);
            return query;
          },
          order(column, { ascending }) {
            rows.sort((left, right) =>
              ascending
                ? Number(left[column]) - Number(right[column])
                : Number(right[column]) - Number(left[column])
            );
            return query;
          },
          limit(size) {
            rows = rows.slice(0, size);
            return query;
          },
          async maybeSingle() {
            return { data: rows[0] || null, error: null };
          },
        };
        return query;
      },
    },
  };
}

function template(overrides = {}) {
  return {
    type: "quote_approved",
    name: "Order Approved",
    emailSubject: "Approved {{order_number}}",
    emailBody: "Hi {{customer_name}}, version one.",
    smsMessage: "Approved {{order_number}}.",
    ...overrides,
  };
}

const versionOne = {
  id: "quote_approved:v1",
  template_type: "quote_approved",
  version: 1,
  name: "Order Approved",
  email_subject: "Approved {{order_number}}",
  email_body: "Hi {{customer_name}}, version one.",
  sms_message: "Approved {{order_number}}.",
  required_merge_fields: [],
  status: "published",
  published_at: "2026-07-24T12:00:00.000Z",
};

test("C5 successful editor saves create sequential immutable published versions", async () => {
  const { client, versions, calls } = createTemplateClient([versionOne]);

  await updateNotificationTemplate(
    "quote_approved",
    template({ emailBody: "Hi {{customer_name}}, version two." }),
    { client }
  );
  await updateNotificationTemplate(
    "quote_approved",
    template({ emailBody: "Hi {{customer_name}}, version three." }),
    { client }
  );

  expect(calls.map(([name]) => name)).toEqual([
    "save_notification_template_version",
    "save_notification_template_version",
  ]);
  expect(versions.map((entry) => entry.id)).toEqual([
    "quote_approved:v1",
    "quote_approved:v2",
    "quote_approved:v3",
  ]);
  expect(versions[0].email_body).toContain("version one");
  expect(versions[1].email_body).toContain("version two");
  expect(versions[2]).toMatchObject({
    status: "published",
    email_body: "Hi {{customer_name}}, version three.",
  });
});

test("C5 resolves the latest publication while preserving existing policy assignments and history", async () => {
  const { client, versions } = createTemplateClient([versionOne]);
  await saveNotificationTemplateVersion(
    template({ emailBody: "Hi {{customer_name}}, newly published." }),
    { client }
  );
  await saveNotificationTemplateVersion(
    template({ emailBody: "Hi {{customer_name}}, future draft." }),
    { client, status: "draft" }
  );

  const policy = {
    email_enabled: true,
    sms_enabled: false,
    staff_notification_enabled: false,
    channel_template_assignments: { email: "quote_approved:v1" },
  };
  const assignmentBeforeResolution = structuredClone(
    policy.channel_template_assignments
  );
  const result = await resolvePublishedNotificationTemplates({
    eventType: "quote_approved",
    policy,
    mergeContext: {
      customer_name: "Taylor",
      order_number: "TC-5001",
      company_name: "Tee & Co",
    },
    client,
  });

  expect(result.snapshots.email).toMatchObject({
    templateVersionId: "quote_approved:v2",
    templateVersion: 2,
    content: {
      subject: "Approved TC-5001",
      body: "Hi Taylor, newly published.",
    },
  });
  expect(policy.channel_template_assignments).toEqual(
    assignmentBeforeResolution
  );
  expect(versions).toHaveLength(3);
  expect(versions[0]).toEqual(versionOne);
  expect(versions[2].status).toBe("draft");
});

test("C5 reset publishes defaults as another immutable version", async () => {
  const { client, versions } = createTemplateClient([versionOne]);
  const defaults = buildDefaultNotificationTemplates().find(
    (entry) => entry.type === "quote_approved"
  );

  const reset = await resetNotificationTemplate("quote_approved", { client });

  expect(reset).toMatchObject({
    name: defaults.templateName,
    emailSubject: defaults.emailSubject,
    emailBody: defaults.emailBody,
    smsMessage: defaults.smsMessage,
  });
  expect(versions).toHaveLength(2);
  expect(versions[1]).toMatchObject({
    id: "quote_approved:v2",
    status: "published",
    name: defaults.templateName,
    email_subject: defaults.emailSubject,
    email_body: defaults.emailBody,
    sms_message: defaults.smsMessage,
  });
});

test("C5 migration provides atomic publication, immutable history, and Owner-only execution", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-c5-template-version-publishing.sql",
      import.meta.url
    ),
    "utf8"
  );
  const editor = await readFile(
    new URL("../src/admin/NotificationTemplates.jsx", import.meta.url),
    "utf8"
  );

  expect(migration).toContain(
    "create or replace function public.save_notification_template_version"
  );
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("coalesce(max(version), 0) + 1");
  expect(migration).toContain(
    "insert into public.notification_template_versions"
  );
  expect(migration).toContain("update public.notification_templates");
  expect(migration).toContain(
    "create trigger protect_notification_template_version"
  );
  expect(migration).toContain(
    "if not public.is_notification_engine_owner() then"
  );
  expect(migration).toContain(
    ") to authenticated, service_role;"
  );
  expect(editor).toContain(
    "await updateNotificationTemplate(type, updates)"
  );
  expect(editor).toContain("await resetNotificationTemplate(type)");
});
