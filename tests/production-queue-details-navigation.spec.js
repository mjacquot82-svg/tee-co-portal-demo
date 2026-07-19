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
      garment: "Gildan 18000 Crewneck Sweatshirt",
      qty: 12,
      status: "Ready For Production",
      workflow_state: "Ready For Production",
      staff_review_status: "Approved",
      approval_status: "Approved",
      artwork_approval_status: "Approved",
      deposit_required: false,
      deposit_workflow_status: "Deposit Received",
      deposit_applied: 25,
      total_paid: 25,
      total_amount: 100,
      balance_due: 75,
      payment_collection_state: "Awaiting Final Payment",
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

  await page.route("**/rest/v1/orders*", (route) => route.abort());
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
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", "");
  await expect(page.getByTestId("job-identity-customer")).toContainText("Details Navigation Test");
  await expect(page.getByTestId("job-identity-garment")).toContainText("Gildan 18000 Crewneck Sweatshirt");
  await expect(page.getByTestId("job-identity-decoration-method")).toContainText("DTF");
  await expect(page.getByTestId("job-identity-quantity")).toContainText("12");
  await expect(page.getByTestId("process-current-task")).toContainText("What should Teresa do next?");
  await expect(page.getByTestId("process-current-task")).toContainText("Order Transfers");
  await expect(page.getByTestId("process-current-task")).toContainText("Task State: Available");
  await expect(page.getByTestId("process-current-task")).toContainText(
    "This task is available because it has no incomplete prerequisites."
  );
  await expect(page.getByTestId("process-next-task")).toContainText("Receive Transfers");
  await expect(page.getByTestId("process-next-task")).toContainText("Waiting for Order Transfers.");
  await expect(page.getByTestId("order-assignment-panel")).toContainText("Assigned Operator");
  await expect(page.getByTestId("order-assignment-panel")).toContainText("Reassign");

  const visibleWorkstationText = await page.locator("body").innerText();
  [
    "Ready For Production",
    "Current Status",
    "Final status reached",
    "Move To Production",
    "Force Move To Production",
    "Release to production",
    "Production Readiness",
    "Next recommended action",
  ].forEach((legacyConcept) => expect(visibleWorkstationText).not.toContain(legacyConcept));

  await expect(page.getByRole("button", { name: "Send Deposit Request" })).toHaveCount(0);
  await expect(page.getByTestId("payment-details-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("quote-snapshot-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("activity-timeline-disclosure")).not.toHaveAttribute("open", "");

  const identityBox = await page.getByTestId("production-job-identity").boundingBox();
  const currentWorkBox = await page.getByTestId("production-progress-tracker").boundingBox();
  expect(identityBox?.y).toBeLessThan(currentWorkBox?.y || Number.POSITIVE_INFINITY);

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
