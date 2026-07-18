// @ts-check
import { expect, test } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

async function seedEligibleDtfOrder(page) {
  return page.evaluate(() => {
    const storageKey = "teeCoStaffOrders";
    const existing = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const base = existing.find((order) => order.status === "Ready For Production") || existing[0] || {};
    const orderNumber = `TC-DETAILS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const now = new Date().toISOString();

    existing.unshift({
      ...base,
      id: orderNumber,
      order_number: orderNumber,
      customer_name: "Details Navigation Test",
      status: "Ready For Production",
      workflow_state: "Ready For Production",
      staff_review_status: "Approved",
      approval_status: "Approved",
      artwork_approval_status: "Approved",
      deposit_required: false,
      deposit_workflow_status: "Deposit Not Required",
      production_type: "DTF",
      decoration_type: "DTF",
      created_at: now,
      updated_at: now,
    });
    window.localStorage.setItem(storageKey, JSON.stringify(existing));
    return orderNumber;
  });
}

test("Production Queue Details opens the correct full order workspace", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedEligibleDtfOrder(page);
  await page.reload();
  await page.getByTestId("production-queue-search").fill(orderNumber);

  const row = page.locator(
    `[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`
  );
  await expect(row).toBeVisible();

  const queueActionCount = await row
    .locator('[data-testid="production-workflow-action"], [data-testid="claim-job-button"]')
    .count();
  await expect(row.getByTestId("production-queue-row-details")).toBeVisible();
  await row.getByTestId("production-queue-row-details").click();

  await expect(page).toHaveURL(
    new RegExp(`/admin/orders/${orderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  );
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-order-number",
    orderNumber
  );
  await expect(page.getByTestId("process-instance-summary")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("production-queue-page")).toBeVisible();
  const restoredRow = page.locator(
    `[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`
  );
  await expect(restoredRow).toBeVisible();
  await expect(
    restoredRow.locator(
      '[data-testid="production-workflow-action"], [data-testid="claim-job-button"]'
    )
  ).toHaveCount(queueActionCount);
});
