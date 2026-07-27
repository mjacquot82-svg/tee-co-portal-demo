import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  NOTIFICATION_TEMPLATE_DEFINITIONS,
  buildDefaultNotificationTemplates,
  renderNotificationTemplatePreview,
  renderTemplateContent,
} from "../src/lib/notificationTemplatesStore";

test("buildDefaultNotificationTemplates includes all supported notification types", () => {
  const defaults = buildDefaultNotificationTemplates();

  expect(defaults).toHaveLength(NOTIFICATION_TEMPLATE_DEFINITIONS.length);
  expect(defaults.map((template) => template.type)).toEqual(
    NOTIFICATION_TEMPLATE_DEFINITIONS.map((template) => template.type)
  );
});

test("renderTemplateContent replaces known merge fields and preserves unknown tokens", () => {
  const rendered = renderTemplateContent(
    "Hello {{customer_name}}, order {{order_number}} is ready. {{unknown_token}}",
    {
      customer_name: "Taylor",
      order_number: "TC-101",
    }
  );

  expect(rendered).toBe("Hello Taylor, order TC-101 is ready. {{unknown_token}}");
});

test("renderNotificationTemplatePreview renders all template content fields", () => {
  const preview = renderNotificationTemplatePreview(
    {
      type: "order_ready_for_pickup",
      label: "Order Ready For Pickup",
      templateName: "Order Ready For Pickup",
      emailSubject: "Pickup: {{order_number}}",
      emailBody: "Hi {{customer_name}}, pick up on {{pickup_date}}.",
      smsMessage: "Pickup for {{order_number}} on {{pickup_date}}",
      emailEnabled: true,
      smsEnabled: true,
      staffNotificationEnabled: true,
    },
    {
      customer_name: "Morgan",
      order_number: "TC-2500",
      pickup_date: "2026-10-12",
    }
  );

  expect(preview).toEqual({
    emailSubject: "Pickup: TC-2500",
    emailBody: "Hi Morgan, pick up on 2026-10-12.",
    smsMessage: "Pickup for TC-2500 on 2026-10-12",
  });
});

test("approval and production use distinct customer SMS templates", () => {
  const templates = buildDefaultNotificationTemplates();
  const approval = templates.find((template) => template.type === "quote_approved");
  const production = templates.find((template) => template.type === "order_in_production");
  const mergeFields = {
    customer_name: "Morgan",
    order_number: "TC-EVENT-MAPPING",
  };

  expect(approval).toBeTruthy();
  expect(production).toMatchObject({
    smsEnabled: true,
  });

  const approvalSms = renderTemplateContent(approval.smsMessage, mergeFields);
  const productionSms = renderTemplateContent(production.smsMessage, mergeFields);

  expect(approvalSms).toContain("has been approved");
  expect(productionSms).toContain("has entered our production schedule");
  expect(productionSms).not.toBe(approvalSms);
});

test("production migration enables the distinct production SMS for existing templates", async () => {
  const migration = await readFile(
    new URL("../supabase/order-in-production-notification-template.sql", import.meta.url),
    "utf8"
  );

  expect(migration).toContain("update public.notification_templates");
  expect(migration).toContain("where type = 'order_in_production'");
  expect(migration).toContain("sms_enabled = true");
  expect(migration).toContain("has entered our production schedule");
  expect(migration).not.toContain("quote_approved");
});
