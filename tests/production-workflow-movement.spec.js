// @ts-check
import { test, expect } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

const STAGE_SEQUENCE = [
  {
    actionKey: "move_to_production",
    status: "Ready For Production",
    filterKey: "ready-for-production",
    timelineFragments: ["move to production", "production queue", "ready for production"],
    nextActionKey: "start_printing",
  },
  {
    actionKey: "start_printing",
    status: "Printing",
    filterKey: "printing",
    timelineFragments: ["printing", "production started"],
    nextActionKey: "move_to_qc",
  },
  {
    actionKey: "move_to_qc",
    status: "QC / Finishing",
    filterKey: "qc-finishing",
    timelineFragments: ["qc", "finishing"],
    nextActionKey: "mark_ready_for_pickup",
  },
  {
    actionKey: "mark_ready_for_pickup",
    status: "Ready For Pickup",
    filterKey: "ready-for-pickup",
    timelineFragments: ["ready for pickup", "pickup"],
    nextActionKey: "complete_order",
  },
  {
    actionKey: "complete_order",
    status: "Completed",
    filterKey: "completed",
    timelineFragments: ["complete", "completed"],
    nextActionKey: "",
  },
];

function getQueueRow(page, orderNumber) {
  return page.locator(`[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`);
}

function getWorkflowActionButton(page, actionKey) {
  return page.locator(
    `[data-testid="workflow-action-button"][data-action-key="${actionKey}"]`
  );
}

async function waitForQueuePage(page) {
  await expect(page.getByTestId("production-queue-page")).toBeVisible();
  await expect(page.getByTestId("production-queue-search")).toBeVisible();
}

async function focusQueueOnOrder(page, orderNumber, filterKey) {
  await waitForQueuePage(page);
  await page.getByTestId(`production-status-filter-${filterKey}`).click();
  await page.getByTestId("production-queue-search").fill(orderNumber);
}

async function findEligibleProductionOrder(page, config) {
  await waitForQueuePage(page);

  if (config.productionOrderText) {
    await page.getByTestId("production-queue-search").fill(config.productionOrderText);
  }

  const eligibleRows = page
    .getByTestId("production-queue-row")
    .filter({
      has: page.locator(
        '[data-testid="production-workflow-action"][data-action-key="move_to_production"][data-blocked="false"]'
      ),
    });
  const targetedRow = config.productionOrderText
    ? eligibleRows.filter({ hasText: config.productionOrderText }).first()
    : eligibleRows.first();

  await expect(
    targetedRow,
    "Unable to find a production-capable order with a Move To Production action in the live queue."
  ).toBeVisible();

  const orderNumber = await targetedRow.getAttribute("data-order-number");
  if (!orderNumber) {
    throw new Error("The targeted production queue row is missing its data-order-number attribute.");
  }

  return { row: targetedRow, orderNumber };
}

async function openOrderDetailFromQueue(page, row, orderNumber) {
  // Open the real queue detail view first so the regression covers production operators' normal entry point.
  await row.getByTestId("production-queue-open-detail").click();

  const detailDrawer = page.getByTestId("production-queue-detail-drawer");
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer).toHaveAttribute("data-order-number", orderNumber);

  // Move from the queue drawer into the full order workspace before driving the workflow transitions.
  await detailDrawer.getByTestId("production-queue-detail-open-full-order").click();
  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-order-number", orderNumber);
}

async function getTimelineItemCount(page) {
  return page.getByTestId("activity-timeline-item").count();
}

async function expectTimelineToMention(page, fragments) {
  const normalizedFragments = fragments.map((fragment) => fragment.toLowerCase());

  await expect
    .poll(
      async () => {
        const notes = await page.getByTestId("activity-timeline-item-note").allTextContents();
        const normalizedNotes = notes.map((note) => note.toLowerCase());

        return normalizedFragments.some((fragment) =>
          normalizedNotes.some((note) => note.includes(fragment))
        );
      },
      {
        message: `Expected the activity timeline to mention one of: ${fragments.join(", ")}`,
        timeout: 15_000,
      }
    )
    .toBe(true);
}

async function expectAssignmentVisibility(page) {
  await expect(page.getByTestId("assigned-staff-value")).toBeVisible();
  await expect(page.getByTestId("production-owner-value")).toBeVisible();
}

async function expectDetailWorkflowState(page, status) {
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", status);
  await expect(page.getByTestId("order-detail-current-status")).toContainText(status);
  await expect(
    page.locator(`[data-testid="production-progress-stage"][data-stage="${status}"]`)
  ).toHaveAttribute("data-stage-state", "active");
  await expectAssignmentVisibility(page);
}

async function expectQueueWorkflowState(page, orderNumber, filterKey, status) {
  // Re-check the production queue after each transition so the centralized workflow state stays consistent outside the detail page.
  await focusQueueOnOrder(page, orderNumber, filterKey);

  const queueRow = getQueueRow(page, orderNumber);
  await expect(
    queueRow,
    `Expected order ${orderNumber} to appear in the ${status} production queue grouping.`
  ).toBeVisible();
  await expect(queueRow).toHaveAttribute("data-workflow-state", status);
  await expect(queueRow.getByTestId("production-queue-row-status")).toContainText(status);
  await expect(queueRow.getByTestId("production-queue-row-assignment")).toBeVisible();
  await expect(queueRow.getByTestId("production-queue-row-owner")).toBeVisible();
}

async function runWorkflowTransition(detailPage, queuePage, orderNumber, stage, previousTimelineCount) {
  // Drive the real production action from the order detail workflow panel.
  await getWorkflowActionButton(detailPage, stage.actionKey).click();

  await expectDetailWorkflowState(detailPage, stage.status);
  await expectQueueWorkflowState(queuePage, orderNumber, stage.filterKey, stage.status);

  await expect
    .poll(() => getTimelineItemCount(detailPage), {
      message: `Expected a new timeline entry after moving order ${orderNumber} to ${stage.status}.`,
      timeout: 15_000,
    })
    .toBeGreaterThan(previousTimelineCount);
  await expectTimelineToMention(detailPage, stage.timelineFragments);

  if (stage.nextActionKey) {
    await expect(getWorkflowActionButton(detailPage, stage.nextActionKey)).toBeVisible();
  }

  return getTimelineItemCount(detailPage);
}

async function exerciseHoldResumeIfAvailable(detailPage, queuePage, orderNumber) {
  const putOnHoldButton = getWorkflowActionButton(detailPage, "put_on_hold");

  // Hold and resume are optional by state, but if they are present they must remain operationally consistent.
  if (!(await putOnHoldButton.isVisible())) {
    return await getTimelineItemCount(detailPage);
  }

  const beforeHoldCount = await getTimelineItemCount(detailPage);
  await putOnHoldButton.click();

  await expect(detailPage.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "On Hold"
  );
  await expect(detailPage.getByTestId("order-detail-current-status")).toContainText("On Hold");
  await expectAssignmentVisibility(detailPage);
  await expect(getWorkflowActionButton(detailPage, "resume_from_hold")).toBeVisible();
  await expectQueueWorkflowState(queuePage, orderNumber, "on-hold", "On Hold");
  await expect
    .poll(() => getTimelineItemCount(detailPage), {
      message: `Expected a new timeline entry after placing order ${orderNumber} on hold.`,
      timeout: 15_000,
    })
    .toBeGreaterThan(beforeHoldCount);
  await expectTimelineToMention(detailPage, ["hold"]);

  const beforeResumeCount = await getTimelineItemCount(detailPage);
  await getWorkflowActionButton(detailPage, "resume_from_hold").click();

  await expectDetailWorkflowState(detailPage, "Ready For Production");
  await expectQueueWorkflowState(queuePage, orderNumber, "ready-for-production", "Ready For Production");
  await expect
    .poll(() => getTimelineItemCount(detailPage), {
      message: `Expected a new timeline entry after resuming order ${orderNumber} from hold.`,
      timeout: 15_000,
    })
    .toBeGreaterThan(beforeResumeCount);
  await expectTimelineToMention(detailPage, ["resumed", "resume"]);
  await expect(getWorkflowActionButton(detailPage, "start_printing")).toBeVisible();

  return getTimelineItemCount(detailPage);
}

test("production workflow state transitions stay consistent across queue, detail, and timeline views", async ({
  page,
}) => {
  const config = getOperationalConfig();

  // Enter through the real staff login route so workflow actions run under the operational session model.
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const seededOrderNumber = `TC-PROD-${Date.now().toString().slice(-6)}`;
  await page.evaluate((orderNumber) => {
    const storageKey = "teeCoStaffOrders";
    const currentOrders = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const seedOrder = currentOrders[0] || {};
    const now = new Date().toISOString();

    currentOrders.unshift({
      ...seedOrder,
      order_number: orderNumber,
      customer_name: "Production Movement Test",
      garment: seedOrder.garment || "Production Tee",
      status: "New",
      workflow_state: "New",
      operational_visible: true,
      quote_status: "Approved",
      artwork_approval_required: false,
      artwork_approval_status: "Not Required",
      deposit_required: false,
      deposit_amount: 0,
      deposit_workflow_status: "Deposit Not Required",
      workflow_overrides: {},
      payment_history: [],
      total_paid: 0,
      activity_log: [],
      created_at: now,
      updated_at: now,
    });

    window.localStorage.setItem(storageKey, JSON.stringify(currentOrders));
  }, seededOrderNumber);

  await page.reload();
  const { row, orderNumber } = await findEligibleProductionOrder(page, {
    ...config,
    productionOrderText: seededOrderNumber,
  });
  const initialWorkflowState = (await row.getAttribute("data-workflow-state")) || "New";
  await openOrderDetailFromQueue(page, row, orderNumber);
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", "New");
  await expect(page.getByTestId("order-detail-current-status")).toContainText("New");
  await expectAssignmentVisibility(page);

  const queuePage = await page.context().newPage();
  await queuePage.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(queuePage, config, "/admin/orders");
  await expectQueueWorkflowState(queuePage, orderNumber, "active", initialWorkflowState);

  let timelineCount = await getTimelineItemCount(page);

  for (const stage of STAGE_SEQUENCE) {
    timelineCount = await runWorkflowTransition(
      page,
      queuePage,
      orderNumber,
      stage,
      timelineCount
    );

    if (stage.status === "Ready For Production") {
      timelineCount = await exerciseHoldResumeIfAvailable(page, queuePage, orderNumber);
    }
  }

  // Refresh after completion to prove the final workflow state persists through a full read-back cycle.
  await page.reload();
  await expectDetailWorkflowState(page, "Completed");
  await expectQueueWorkflowState(queuePage, orderNumber, "completed", "Completed");

  await queuePage.close();
});

test("production gating blocks movement until an override is used", async ({ page }) => {
  const config = getOperationalConfig();

  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const blockedOrderNumber = `TC-BLOCK-${Date.now().toString().slice(-6)}`;
  await page.evaluate((orderNumber) => {
    const storageKey = "teeCoStaffOrders";
    const currentOrders = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const seedOrder = currentOrders[0] || {};
    const now = new Date().toISOString();

    currentOrders.unshift({
      ...seedOrder,
      order_number: orderNumber,
      customer_name: "Blocked Workflow Test",
      garment: seedOrder.garment || "Test Tee",
      status: "New",
      workflow_state: "New",
      operational_visible: true,
      quote_status: "Approved",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      deposit_required: true,
      deposit_amount: Number(seedOrder.deposit_amount || 50) || 50,
      deposit_workflow_status: "Awaiting Deposit",
      workflow_overrides: {},
      payment_history: [],
      total_paid: 0,
      activity_log: [],
      created_at: now,
      updated_at: now,
    });

    window.localStorage.setItem(storageKey, JSON.stringify(currentOrders));
  }, blockedOrderNumber);

  await page.reload();
  await focusQueueOnOrder(page, blockedOrderNumber, "active");
  const row = getQueueRow(page, blockedOrderNumber);
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-production-readiness", "blocked");
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText("Blocked");
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText("Next recommended action");
  await expect(row.getByTestId("production-queue-row-blockers")).toContainText("Responsible");
  await expect(
    row.locator('[data-testid="production-workflow-action"][data-action-key="move_to_production"]')
  ).toHaveCount(0);

  await openOrderDetailFromQueue(page, row, blockedOrderNumber);
  const initialTimelineCount = await getTimelineItemCount(page);
  await getWorkflowActionButton(page, "move_to_production").click();

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", "New");
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: "Expected a production blocked event after the gated action was attempted.",
      timeout: 15_000,
    })
    .toBeGreaterThan(initialTimelineCount);
  await expectTimelineToMention(page, ["blocked", "artwork", "deposit"]);

  await page.getByRole("button", { name: "Force Move To Production" }).click();
  await expectDetailWorkflowState(page, "Ready For Production");
  await expect(getWorkflowActionButton(page, "start_printing")).toBeVisible();
  await expectTimelineToMention(page, ["override", "forced", "production"]);
});

test("completed orders do not expose production start actions even with stale workflow state", async ({
  page,
}) => {
  const config = getOperationalConfig();

  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const completedOrderNumber = `TC-DONE-${Date.now().toString().slice(-6)}`;
  await page.evaluate((orderNumber) => {
    const storageKey = "teeCoStaffOrders";
    const currentOrders = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const seedOrder = currentOrders[0] || {};
    const now = new Date().toISOString();

    currentOrders.unshift({
      ...seedOrder,
      order_number: orderNumber,
      customer_name: "Completed Workflow Test",
      garment: seedOrder.garment || "Completed Tee",
      status: "Completed",
      workflow_state: "Ready For Production",
      operational_visible: true,
      quote_status: "Approved",
      artwork_approval_required: false,
      artwork_approval_status: "Not Required",
      deposit_required: false,
      deposit_workflow_status: "Deposit Not Required",
      workflow_overrides: {},
      activity_log: [],
      completed_at: now,
      created_at: now,
      updated_at: now,
    });

    window.localStorage.setItem(storageKey, JSON.stringify(currentOrders));
  }, completedOrderNumber);

  await page.goto(`/admin/orders/${completedOrderNumber}`);
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-workflow-state", "Completed");
  await expect(page.getByTestId("production-readiness-indicator")).toHaveAttribute(
    "data-production-readiness",
    "completed"
  );
  await expect(page.getByTestId("production-readiness-summary")).toHaveAttribute(
    "data-production-readiness",
    "completed"
  );
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveCount(0);
  await expect(getWorkflowActionButton(page, "start_printing")).toHaveCount(0);

  await page.goto("/admin/orders");
  await focusQueueOnOrder(page, completedOrderNumber, "completed");
  const row = getQueueRow(page, completedOrderNumber);
  await expect(row).toHaveAttribute("data-workflow-state", "Completed");
  await expect(row).toHaveAttribute("data-production-readiness", "completed");
  await expect(row.locator('[data-testid="production-workflow-action"]')).toHaveCount(0);
});
