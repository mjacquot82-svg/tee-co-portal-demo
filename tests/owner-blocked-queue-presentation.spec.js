// @ts-check
import { expect, test } from "@playwright/test";
import { buildOwnerBlockedQueuePresentation } from "../src/production/ownerBlockedQueuePresentation.js";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

function readinessFor(key, statusLabel, overrides = {}) {
  return {
    blocked: true,
    blockers: [{ key }],
    gating: {
      blockingChecks: [{ key, statusLabel }],
    },
    ...overrides,
  };
}

test("owner blocked queue presents actionable artwork resolution", () => {
  expect(buildOwnerBlockedQueuePresentation(readinessFor("artworkApproval", "Pending Review"))).toEqual({
    actionLabel: "Review Artwork",
    responsibleLabel: "Owner artwork review",
    workspace: "order-management",
  });

  expect(buildOwnerBlockedQueuePresentation(readinessFor("artworkApproval", "Needs Revision"))).toEqual({
    actionLabel: "Contact Customer",
    responsibleLabel: "Customer artwork revision",
    workspace: "order-management",
  });
});

test("owner blocked queue presents payment and general blocker resolution", () => {
  expect(buildOwnerBlockedQueuePresentation(readinessFor("depositRequirement", "Pending Decision"))).toEqual({
    actionLabel: "Open Payment Review",
    responsibleLabel: "Owner payment decision",
    workspace: "financial",
  });

  expect(buildOwnerBlockedQueuePresentation(readinessFor("depositRequirement", "Awaiting Deposit"))).toEqual({
    actionLabel: "Open Payment Review",
    responsibleLabel: "Customer payment, monitored by Owner",
    workspace: "financial",
  });

  expect(buildOwnerBlockedQueuePresentation(readinessFor("hold", ""))).toEqual({
    actionLabel: "Resolve Blocker",
    responsibleLabel: "Owner review",
    workspace: "order-management",
  });
});

test("owner blocked queue uses a coordination action for multiple blockers", () => {
  expect(buildOwnerBlockedQueuePresentation({
    blocked: true,
    blockers: [{ key: "artworkApproval" }, { key: "depositRequirement" }],
  })).toEqual({
    actionLabel: "Resolve Blockers",
    responsibleLabel: "Owner coordination",
    workspace: "order-management",
  });
});

test("owner queue keeps staff escalation presentation role-scoped", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/Orders.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("owner-blocked-action-button");
  expect(source).toContain("ownerBlockedPresentation ? (");
  expect(source).toContain(") : onEscalate ? (");
  expect(source).toContain("escalate-to-owner-button");
});

test("owner sees an actionable artwork blocker instead of escalation to self", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");
  await page.route("**/rest/v1/orders*", (route) => route.abort());

  const orderNumber = await page.evaluate(() => {
    const storageKey = "teeCoStaffOrders";
    const existing = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const base = existing[0] || {};
    const seededOrderNumber = `TC-OWNER-BLOCK-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    existing.unshift({
      ...base,
      id: seededOrderNumber,
      order_number: seededOrderNumber,
      customer_name: "Owner Blocker Review",
      status: "Ready For Production",
      workflow_state: "Ready For Production",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      deposit_required: false,
      deposit_workflow_status: "Deposit Not Required",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    window.localStorage.setItem(storageKey, JSON.stringify(existing));
    return seededOrderNumber;
  });

  await page.reload();
  await page.getByTestId("production-queue-search").fill(orderNumber);
  const row = page.locator(
    `[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`
  );
  await expect(row).toBeVisible();
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText(
    "Blocked: Artwork must be approved before production starts."
  );
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText(
    "Responsible: Owner artwork review"
  );
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText(
    "Next action: Review Artwork"
  );
  await expect(row.getByTestId("escalate-to-owner-button")).toHaveCount(0);

  await row.getByTestId("owner-blocked-action-button").click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/orders/${orderNumber}\\?workspace=order-management$`)
  );
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-order-number",
    orderNumber
  );
  await expect(page.getByTestId("order-workspace-order-management")).toBeVisible();
  await expect(page.getByTestId("order-management-prerequisites")).toBeVisible();
  await expect(page.getByTestId("order-management-artwork")).toBeVisible();
  await expect(page.getByTestId("order-management-customer")).toBeVisible();
  await expect(page.getByTestId("order-management-decisions")).toBeVisible();
});
