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
      placements: [{ placement: "Left Chest" }],
      due_date: "2026-07-31",
      size_breakdown: { M: 5, L: 7 },
      production_notes: "Match the approved artwork colors.",
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
  await expect(page.getByTestId("production-current-action")).toBeVisible();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", "");
  await expect(page.getByTestId("job-identity-customer")).toContainText("Details Navigation Test");
  await expect(page.getByTestId("job-identity-garment")).toContainText("Gildan 18000 Crewneck Sweatshirt");
  await expect(page.getByTestId("job-identity-decoration-method")).toContainText("DTF");
  await expect(page.getByTestId("job-identity-quantity")).toContainText("12");
  await expect(page.getByTestId("job-identity-placement")).toContainText("Left Chest");
  await expect(page.getByTestId("job-identity-due-date")).toContainText("2026-07-31");
  await expect(page.getByTestId("job-identity-sizes")).toContainText("M: 5 · L: 7");
  await expect(page.getByTestId("production-current-action")).toContainText("Order Transfers");
  await expect(page.getByTestId("production-current-action")).toContainText("Task state: Available");
  await expect(page.getByTestId("production-current-action")).toContainText(
    "This task is available because it has no incomplete prerequisites."
  );
  await expect(page.getByTestId("process-next-task")).toHaveCount(0);
  await expect(page.getByTestId("production-header-assignment")).toContainText("Assigned Employee");
  await expect(page.getByTestId("production-header-assignment")).toContainText("Production Owner");
  await expect(page.getByTestId("production-header-assignment")).toContainText("Assign Employee");
  await expect(page.getByTestId("execution-prerequisite-summary")).toHaveCount(0);
  await expect(page.getByTestId("workflow-gate")).toHaveCount(0);
  const assignmentText = await page.getByTestId("production-header-assignment").innerText();
  [
    "Artwork Approved",
    "Deposit Received",
    "Production Ready",
    "Ready For Production",
    "Customer Status Message",
    "Production Readiness",
    "Current Status",
    "Next recommended action",
  ].forEach((duplicateWorkflowFact) => expect(assignmentText).not.toContain(duplicateWorkflowFact));

  const visibleWorkstationText = await page.locator("body").innerText();
  [
    "Current Status",
    "Final status reached",
    "Move To Production",
    "Force Move To Production",
    "Release to production",
    "Production Readiness",
    "Next recommended action",
  ].forEach((legacyConcept) => expect(visibleWorkstationText).not.toContain(legacyConcept));

  await expect(page.getByTestId("order-workspace-tab-production")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("order-workspace-financial")).toHaveCount(0);
  await expect(page.getByTestId("order-workspace-order-management")).toHaveCount(0);
  await expect(page.getByText("Payment Summary", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Create Payment Request", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Quote Snapshot", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("activity-timeline")).toHaveCount(0);
  await expect(page.getByText("Production Instructions", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("garment-production-artwork")).toBeVisible();
  await expect(page.getByTestId("production-notes")).toContainText("Match the approved artwork colors.");
  await expect(page.getByTestId("garment-production-file")).toBeVisible();

  const identityBox = await page.getByTestId("production-job-identity").boundingBox();
  const currentWorkBox = await page.getByTestId("production-current-action").boundingBox();
  const garmentBox = await page.getByTestId("garment-production-card").boundingBox();
  const artworkBox = await page.getByTestId("garment-production-artwork").boundingBox();
  const notesBox = await page.getByTestId("production-notes").boundingBox();
  expect(identityBox?.y).toBeLessThan(currentWorkBox?.y || Number.POSITIVE_INFINITY);
  expect(currentWorkBox?.y).toBeLessThan(garmentBox?.y || Number.POSITIVE_INFINITY);
  expect(artworkBox?.y).toBeGreaterThanOrEqual(garmentBox?.y || 0);
  expect(garmentBox?.y).toBeLessThan(notesBox?.y || Number.POSITIVE_INFINITY);
  expect(notesBox?.y).toBeLessThan(1000);

  await page.getByTestId("order-workspace-tab-financial").click();
  await expect(page).toHaveURL(/workspace=financial/);
  await expect(page.getByTestId("order-workspace-tab-financial")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Payment Summary", { exact: true })).toBeVisible();
  await expect(page.getByText("Create Payment Request", { exact: true })).toBeVisible();
  await expect(page.getByTestId("quote-snapshot-disclosure")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Deposit Request" })).toHaveCount(0);
  await expect(page.getByTestId("process-instance-summary")).toHaveCount(0);
  await expect(page.getByTestId("activity-timeline")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("order-workspace-tab-financial")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Payment Summary", { exact: true })).toBeVisible();

  await page.getByTestId("order-workspace-tab-order-management").click();
  await expect(page).toHaveURL(/workspace=order-management/);
  await expect(page.getByTestId("order-workspace-tab-order-management")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Manage this order", { exact: true })).toBeVisible();
  await expect(page.getByTestId("order-management-notes")).toBeVisible();
  await expect(page.getByTestId("activity-timeline")).toBeVisible();
  await expect(page.getByTestId("activity-timeline-disclosure")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("process-instance-summary")).toHaveCount(0);
  await expect(page.getByText("Payment Summary", { exact: true })).toHaveCount(0);

  await page.getByTestId("order-workspace-tab-production").click();
  await expect(page).not.toHaveURL(/workspace=/);
  await expect(page.getByTestId("production-current-action")).toBeVisible();

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
