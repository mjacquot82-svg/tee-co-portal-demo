import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildDefaultNotificationTemplates,
  renderTemplateContent,
} from "../src/lib/notificationTemplatesStore.js";
import { AUTHORITATIVE_NOTIFICATION_EVENTS } from "../src/lib/notificationEngineCutover.js";
import { buildNotificationBusinessEventRow } from "../src/lib/notificationBusinessEvents.js";

const JOURNEY = [
  {
    event: "quote_approved",
    milestone: "approved",
    action: "No action is needed",
  },
  {
    event: "deposit_requested",
    milestone: "before production can be scheduled",
    action: "pay here:",
  },
  {
    event: "payment_received",
    milestone: "received your $125.00 deposit",
    action: "no action is needed",
  },
  {
    event: "order_in_production",
    milestone: "entered production",
    action: "no action is needed",
  },
  {
    event: "order_ready_for_pickup",
    milestone: "ready for pickup",
    action: "please arrange pickup",
  },
  {
    event: "order_completed",
    milestone: "is complete",
    action: "no action is needed",
  },
];

const MERGE_FIELDS = {
  customer_name: "Morgan",
  order_number: "TC-JOURNEY-1",
  deposit_amount: "$125.00",
  balance_due: "$75.00",
  payment_link: "https://pay.example/TC-JOURNEY-1",
  company_name: "Tee & Co",
};

test("customer lifecycle SMS journey communicates six distinct milestones", () => {
  const templates = new Map(
    buildDefaultNotificationTemplates().map((template) => [
      template.type,
      template,
    ])
  );
  const rendered = JOURNEY.map(({ event, milestone, action }) => {
    const template = templates.get(event);
    expect(template).toMatchObject({
      type: event,
      smsEnabled: true,
    });
    const message = renderTemplateContent(
      template.smsMessage,
      MERGE_FIELDS
    );
    const normalizedMessage = message.toLowerCase();
    expect(normalizedMessage).toContain(milestone.toLowerCase());
    expect(normalizedMessage).toContain(action.toLowerCase());
    expect(message).not.toMatch(/{{\s*[a-z0-9_]+\s*}}/i);
    return message;
  });

  expect(new Set(rendered).size).toBe(JOURNEY.length);
  expect(rendered[0]).not.toContain("deposit");
  expect(rendered[1]).toContain(MERGE_FIELDS.payment_link);
  expect(rendered[2]).not.toContain(MERGE_FIELDS.payment_link);
  expect(rendered[3]).toContain("ready for pickup");
  expect(rendered[4]).not.toContain("production");
  expect(rendered[5]).not.toContain("pickup");
});

test("complete customer journey uses authoritative ingress", () => {
  expect(AUTHORITATIVE_NOTIFICATION_EVENTS).toEqual(
    expect.arrayContaining(JOURNEY.map(({ event }) => event))
  );
});

test("durable event snapshots retain action-critical journey merge data", () => {
  const event = buildNotificationBusinessEventRow("deposit_requested", {
    customerName: MERGE_FIELDS.customer_name,
    orderNumber: MERGE_FIELDS.order_number,
    depositAmount: 125,
    paymentLink: MERGE_FIELDS.payment_link,
    businessEvent: {
      subjectType: "payment_request",
      subjectId: "payment-request-1",
      occurrenceId: "deposit_requested:payment-request-1",
      occurredAt: "2026-07-27T18:00:00.000Z",
    },
  });

  expect(event.payload.notificationMergeContext).toMatchObject({
    customer_name: MERGE_FIELDS.customer_name,
    order_number: MERGE_FIELDS.order_number,
    deposit_amount: MERGE_FIELDS.deposit_amount,
    payment_link: MERGE_FIELDS.payment_link,
    company_name: MERGE_FIELDS.company_name,
  });
});

test("journey migration publishes immutable copy and updates current policies", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/customer-notification-journey-cutover.sql",
      import.meta.url
    ),
    "utf8"
  );

  for (const { event } of JOURNEY) {
    expect(migration).toContain(`'${event}'`);
  }
  expect(migration).toContain(
    "insert into public.notification_template_versions"
  );
  expect(migration).toContain("update public.notification_policies");
  expect(migration).toContain("sms_enabled = true");
  expect(migration).toContain("channel_template_assignments");
  expect(migration).toContain("where not exists");
});
