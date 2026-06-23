import { test, expect } from "@playwright/test";
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
