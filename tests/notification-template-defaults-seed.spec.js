import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  NOTIFICATION_TEMPLATE_DEFINITIONS,
} from "../src/lib/notificationTemplatesStore.js";

test("repository SQL deterministically seeds every canonical notification template", async () => {
  const migration = await readFile(
    new URL("../supabase/notification-templates-defaults-seed.sql", import.meta.url),
    "utf8"
  );

  for (const template of NOTIFICATION_TEMPLATE_DEFINITIONS) {
    expect(migration).toContain(`'${template.type}'`);
    expect(migration).toContain(template.templateName);
    expect(migration).toContain(template.emailSubject);
    expect(migration).toContain(template.emailBody);
    expect(migration).toContain(template.smsMessage.replaceAll("'", "''"));
  }
});

test("canonical template seed preserves existing production data", async () => {
  const migration = await readFile(
    new URL("../supabase/notification-templates-defaults-seed.sql", import.meta.url),
    "utf8"
  );

  expect(migration).toContain("on conflict (type) do nothing");
  expect(migration).not.toMatch(/\bon conflict\b[\s\S]*\bdo update\b/i);
  expect(migration).not.toMatch(/\b(update|delete from|truncate|drop table)\b/i);
});
