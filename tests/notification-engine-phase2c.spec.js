import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildCanonicalNotificationMergeContext,
  getNotificationMergeRule,
  validateNotificationMergeContext,
} from "../src/lib/notificationMergeContext.js";
import { prepareNotificationContentPhase2C } from "../src/lib/notificationEnginePhase2C.js";
import { resolvePublishedNotificationTemplates } from "../src/lib/notificationTemplateResolution.js";

function createPhase2CClient({ versions = [] } = {}) {
  const tables = new Map([
    ["notification_template_versions", versions.map((version) => ({ ...version }))],
    ["notifications", []],
  ]);

  const client = {
    from(table) {
      return {
        select() {
          let rows = [...(tables.get(table) || [])];
          const chain = {
            eq(column, value) {
              rows = rows.filter((row) => row[column] === value);
              return chain;
            },
            order() {
              rows.sort((left, right) => Number(right.version) - Number(left.version));
              return chain;
            },
            limit(size) {
              rows = rows.slice(0, size);
              return chain;
            },
            async maybeSingle() {
              return { data: rows[0] || null, error: null };
            },
          };
          return chain;
        },
        upsert(row) {
          const rows = tables.get(table) || [];
          const index = rows.findIndex((entry) => entry.id === row.id);
          if (index >= 0) rows[index] = { ...rows[index], ...row };
          else rows.push({ ...row });
          tables.set(table, rows);
          return {
            select() {
              return {
                async single() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, tables };
}

function templateVersion(overrides = {}) {
  return {
    id: "quote_approved:v2",
    template_type: "quote_approved",
    version: 2,
    name: "Order Approved",
    email_subject: "Approved: {{order_number}}",
    email_body: "Hi {{customer_name}}, {{order_number}} is approved by {{company_name}}.",
    sms_message: "Order {{order_number}} approved.",
    required_merge_fields: [],
    status: "published",
    ...overrides,
  };
}

function phase2BResult(overrides = {}) {
  const policy = {
    id: "policy:quote_approved:v1",
    event_type: "quote_approved",
    version: 1,
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: false,
    staff_notification_enabled: false,
    channel_template_assignments: { email: "quote_approved:v2" },
  };
  return {
    observed: true,
    policy,
    decision: {
      deliveryMode: "automatic",
      status: "evaluated",
      noDeliveryReason: "",
    },
    notification: {
      id: "notification-1",
      business_event_id: "event-1",
      event_type: "quote_approved",
      subject_type: "order",
      subject_id: "TC-1",
      correlation_id: "order:TC-1",
      policy_id: policy.id,
      policy_version: 1,
      policy_snapshot: policy,
      delivery_mode: "automatic",
      status: "evaluated",
      no_delivery_reason: "",
      engine_metadata: {
        observationOnly: true,
        legacyRuntimeAuthoritative: true,
      },
    },
    ...overrides,
  };
}

test("event-specific rules separate required and optional merge fields", () => {
  const approval = getNotificationMergeRule("quote_approved");
  expect(approval.required).toEqual([
    "customer_name",
    "order_number",
    "company_name",
  ]);
  expect(approval.optional).toContain("payment_link");

  const deposit = getNotificationMergeRule("deposit_requested");
  expect(deposit.required).toContain("deposit_amount");
  expect(deposit.required).toContain("payment_link");
});

test("canonical merge context uses authoritative supplied values without placeholder URLs", () => {
  const mergeContext = buildCanonicalNotificationMergeContext("deposit_requested", {
    order: {
      order_number: "TC-3001",
      customer_name: "Alex Rivera",
      deposit_amount: 120,
    },
    paymentRequest: {
      provider_checkout_url: "https://payments.example/checkout/1",
    },
  });

  expect(mergeContext).toMatchObject({
    customer_name: "Alex Rivera",
    order_number: "TC-3001",
    deposit_amount: "$120.00",
    payment_link: "https://payments.example/checkout/1",
    company_name: "Tee & Co",
  });
  expect(mergeContext.approval_link).toBe("");
});

test("published assigned version renders immutable email snapshots", async () => {
  const { client } = createPhase2CClient({ versions: [templateVersion()] });
  const policy = phase2BResult().policy;
  const result = await resolvePublishedNotificationTemplates({
    eventType: "quote_approved",
    policy,
    mergeContext: {
      customer_name: "Taylor",
      order_number: "TC-3002",
      company_name: "Tee & Co",
    },
    client,
  });

  expect(result.channels).toEqual(["email"]);
  expect(result.snapshots.email).toEqual({
    templateType: "quote_approved",
    templateVersionId: "quote_approved:v2",
    templateVersion: 2,
    content: {
      subject: "Approved: TC-3002",
      body: "Hi Taylor, TC-3002 is approved by Tee & Co.",
    },
    rawMergeTokens: ["order_number", "customer_name", "company_name"],
  });
});

test("successful Phase 2C preparation records snapshots and creates no deliveries", async () => {
  const { client, tables } = createPhase2CClient({ versions: [templateVersion()] });
  const result = await prepareNotificationContentPhase2C({
    phase2BResult: phase2BResult(),
    eventType: "quote_approved",
    context: {
      order: {
        order_number: "TC-3003",
        customer_name: "Morgan Lee",
      },
    },
    client,
  });

  expect(result.prepared).toBe(true);
  expect(result.deliveriesCreated).toBe(0);
  expect(result.notification.engine_metadata.phase2C).toMatchObject({
    status: "prepared",
    deliveriesCreated: 0,
    mergeContext: {
      customer_name: "Morgan Lee",
      order_number: "TC-3003",
      company_name: "Tee & Co",
    },
  });
  expect(
    result.notification.engine_metadata.phase2C.templateSnapshots.email.content
  ).toEqual({
    subject: "Approved: TC-3003",
    body: "Hi Morgan Lee, TC-3003 is approved by Tee & Co.",
  });
  expect(tables.get("notification_deliveries") || []).toHaveLength(0);
});

test("missing required fields are recorded as pre-dispatch resolution failures", async () => {
  const { client, tables } = createPhase2CClient({ versions: [templateVersion()] });
  const result = await prepareNotificationContentPhase2C({
    phase2BResult: phase2BResult(),
    eventType: "quote_approved",
    context: {
      order: { order_number: "TC-3004" },
    },
    client,
  });

  expect(result.prepared).toBe(false);
  expect(result.notification.status).toBe("failed");
  expect(result.failures).toContainEqual({
    stage: "pre_dispatch_resolution",
    code: "missing_required_merge_fields",
    fields: ["customer_name"],
  });
  expect(result.deliveriesCreated).toBe(0);
  expect(tables.get("notification_deliveries") || []).toHaveLength(0);
});

test("unresolved required tokens are rejected before dispatch", () => {
  const validation = validateNotificationMergeContext({
    eventType: "quote_approved",
    mergeContext: {
      customer_name: "Taylor",
      order_number: "TC-3005",
      company_name: "Tee & Co",
    },
    renderedContents: ["Hi Taylor, {{order_number}} is approved."],
  });

  expect(validation.valid).toBe(false);
  expect(validation.unresolvedRequiredTokens).toEqual(["order_number"]);
});

test("policy no-delivery decisions skip content preparation", async () => {
  const { client } = createPhase2CClient({ versions: [templateVersion()] });
  const base = phase2BResult();
  const result = await prepareNotificationContentPhase2C({
    phase2BResult: phase2BResult({
      decision: {
        deliveryMode: "disabled",
        status: "no_delivery",
        noDeliveryReason: "policy_disabled",
      },
      notification: {
        ...base.notification,
        status: "no_delivery",
        no_delivery_reason: "policy_disabled",
      },
    }),
    eventType: "quote_approved",
    context: {},
    client,
  });

  expect(result).toMatchObject({
    prepared: false,
    reason: "policy_decision_skipped",
    deliveriesCreated: 0,
  });
  expect(result.notification.engine_metadata.phase2C.status).toBe(
    "skipped_policy_decision"
  );
});

test("Phase 2C does not contain Phase 2D or provider functionality", async () => {
  const sources = await Promise.all(
    [
      "../src/lib/notificationEnginePhase2C.js",
      "../src/lib/notificationTemplateResolution.js",
      "../src/lib/notificationMergeContext.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );
  const combined = sources.join("\n");

  expect(combined).not.toContain("persistNotificationDelivery(");
  expect(combined).not.toContain("resolveCustomerRecipient");
  expect(combined).not.toContain("recipientSnapshot");
  expect(combined).not.toContain("fetch(");
  expect(combined).not.toContain("Resend");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("retry");
});

