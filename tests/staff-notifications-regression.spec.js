// @ts-check
import { expect, test } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

test("staff notifications route renders without an update loop", async ({ page }) => {
  const runtimeErrors = [];

  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/notifications");
  await loginThroughOperationalPin(page, config, "/admin/notifications");

  await expect(page).toHaveURL(/\/admin\/notifications$/);
  await expect(page.getByRole("heading", { name: /Notifications/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unread/ })).toBeVisible();

  await page.waitForTimeout(500);

  expect(
    runtimeErrors.filter((message) =>
      message.includes("Maximum update depth exceeded")
    )
  ).toEqual([]);
});
