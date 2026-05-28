// @ts-check
import { test, expect } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

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
  await expect(page.getByTestId(`production-status-filter-${filterKey}`)).toBeVisible();
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
    "Unable to find a production-capable live order that can move into production."
  ).toBeVisible();

  const orderNumber = await targetedRow.getAttribute("data-order-number");
  if (!orderNumber) {
    throw new Error("The targeted production queue row is missing its data-order-number attribute.");
  }

  return { row: targetedRow, orderNumber };
}

async function openOrderDetailFromQueue(page, row, orderNumber) {
  // Open through the production queue first so the regression follows the real operational entry path.
  await row.getByTestId("production-queue-open-detail").click();

  const detailDrawer = page.getByTestId("production-queue-detail-drawer");
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer).toHaveAttribute("data-order-number", orderNumber);

  await detailDrawer.getByTestId("production-queue-detail-open-full-order").click();
  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-order-number", orderNumber);
}

async function expectQueueWorkflowState(page, orderNumber, filterKey, expectedStatus) {
  await focusQueueOnOrder(page, orderNumber, filterKey);

  const queueRow = getQueueRow(page, orderNumber);
  await expect(queueRow).toBeVisible();
  await expect(queueRow).toHaveAttribute("data-workflow-state", expectedStatus);
  await expect(queueRow.getByTestId("production-queue-row-status")).toContainText(expectedStatus);
  await expect(queueRow.getByTestId("production-queue-row-assignment")).toBeVisible();
  await expect(queueRow.getByTestId("production-queue-row-owner")).toBeVisible();
}

async function expectDetailWorkflowState(page, expectedStatus) {
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    expectedStatus
  );
  await expect(page.getByTestId("order-detail-current-status")).toContainText(expectedStatus);
}

async function getTimelineItemCount(page) {
  return page.getByTestId("activity-timeline-item").count();
}

async function getTimelineNotes(page) {
  const notes = await page.getByTestId("activity-timeline-item-note").allTextContents();
  return notes.map((note) => note.trim());
}

async function countTimelineMentions(page, fragments) {
  const normalizedFragments = fragments.map((fragment) => fragment.toLowerCase());
  const notes = await getTimelineNotes(page);

  return notes.filter((note) => {
    const normalizedNote = note.toLowerCase();
    return normalizedFragments.some((fragment) => normalizedNote.includes(fragment));
  }).length;
}

async function expectTimelineMentionCountToIncrease(page, fragments, previousCount, message) {
  await expect
    .poll(() => countTimelineMentions(page, fragments), {
      message,
      timeout: 15_000,
    })
    .toBeGreaterThan(previousCount);
}

async function getAssignmentSnapshot(page) {
  return {
    assignedStaff: (await page.getByTestId("assigned-staff-value").textContent())?.trim() || "",
    productionOwner: (await page.getByTestId("production-owner-value").textContent())?.trim() || "",
  };
}

async function getVisibleWorkflowActionKeys(page) {
  return page
    .getByTestId("workflow-action-button")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const element = /** @type {HTMLElement} */ (node);
          return !element.hidden && element.getClientRects().length > 0;
        })
        .map((node) => node.getAttribute("data-action-key") || "")
        .filter(Boolean)
    );
}

async function resolveActiveProductionStage(page) {
  const startPrinting = getWorkflowActionButton(page, "start_printing");
  if (await startPrinting.isVisible().catch(() => false)) {
    return {
      actionKey: "start_printing",
      restoredStatus: "Printing",
      queueFilterKey: "printing",
      nextActionKey: "move_to_qc",
    };
  }

  const startEmbroidery = getWorkflowActionButton(page, "start_embroidery");
  if (await startEmbroidery.isVisible().catch(() => false)) {
    return {
      actionKey: "start_embroidery",
      restoredStatus: "Embroidery",
      queueFilterKey: "embroidery",
      nextActionKey: "move_to_qc",
    };
  }

  throw new Error("Unable to determine the production execution action for the targeted live order.");
}

test("hold and resume preserve centralized production workflow integrity", async ({ page }) => {
  const config = getOperationalConfig();

  // Use the live PIN workflow so state changes happen under the real operational session model.
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const { row, orderNumber } = await findEligibleProductionOrder(page, config);
  await openOrderDetailFromQueue(page, row, orderNumber);

  const queuePage = await page.context().newPage();
  await queuePage.goto("/admin/orders");
  await waitForQueuePage(queuePage);

  // Move the real order into production and then into an active execution stage before testing hold.
  await getWorkflowActionButton(page, "move_to_production").click();
  await expectDetailWorkflowState(page, "Ready For Production");
  await expectQueueWorkflowState(queuePage, orderNumber, "ready-for-production", "Ready For Production");
  await expect(page.getByTestId("production-hold-indicator")).toHaveCount(0);
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);

  const activeStage = await resolveActiveProductionStage(page);
  await getWorkflowActionButton(page, activeStage.actionKey).click();
  await expectDetailWorkflowState(page, activeStage.restoredStatus);
  await expectQueueWorkflowState(
    queuePage,
    orderNumber,
    activeStage.queueFilterKey,
    activeStage.restoredStatus
  );

  const assignmentBeforeHold = await getAssignmentSnapshot(page);
  const holdMentionsBefore = await countTimelineMentions(page, ["placed on hold", "on hold"]);
  const resumeMentionsBefore = await countTimelineMentions(page, ["resumed from hold", "resume"]);
  const timelineCountBeforeHold = await getTimelineItemCount(page);

  // Holding the order must take it out of active execution without breaking assignment or timeline history.
  await getWorkflowActionButton(page, "put_on_hold").click();

  await expectDetailWorkflowState(page, "On Hold");
  await expectQueueWorkflowState(queuePage, orderNumber, "on-hold", "On Hold");
  await expect(page.getByTestId("production-hold-indicator")).toBeVisible();
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(
    getWorkflowActionButton(page, "resume_from_hold"),
    "Resume must target the exact production stage that was active before the hold."
  ).toHaveAttribute("data-target-status", activeStage.restoredStatus);
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: `Expected a new timeline entry after placing ${orderNumber} on hold.`,
      timeout: 15_000,
    })
    .toBeGreaterThan(timelineCountBeforeHold);
  await expectTimelineMentionCountToIncrease(
    page,
    ["placed on hold", "on hold"],
    holdMentionsBefore,
    `Expected the timeline to record a hold event for ${orderNumber}.`
  );

  const restrictedActionKeys = await getVisibleWorkflowActionKeys(page);
  expect(restrictedActionKeys).toContain("resume_from_hold");
  expect(restrictedActionKeys).not.toContain("put_on_hold");
  expect(restrictedActionKeys).not.toContain(activeStage.actionKey);
  expect(restrictedActionKeys).not.toContain(activeStage.nextActionKey);

  const assignmentOnHold = await getAssignmentSnapshot(page);
  expect(assignmentOnHold).toEqual(assignmentBeforeHold);

  const timelineCountBeforeResume = await getTimelineItemCount(page);
  await getWorkflowActionButton(page, "resume_from_hold").click();

  await expectDetailWorkflowState(page, activeStage.restoredStatus);
  await expectQueueWorkflowState(
    queuePage,
    orderNumber,
    activeStage.queueFilterKey,
    activeStage.restoredStatus
  );
  await expect(page.getByTestId("production-hold-indicator")).toHaveCount(0);
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(getWorkflowActionButton(page, activeStage.nextActionKey)).toBeVisible();
  await expect(getWorkflowActionButton(page, activeStage.nextActionKey)).toHaveAttribute(
    "data-blocked",
    "false"
  );
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: `Expected a new timeline entry after resuming ${orderNumber} from hold.`,
      timeout: 15_000,
    })
    .toBeGreaterThan(timelineCountBeforeResume);
  await expectTimelineMentionCountToIncrease(
    page,
    ["resumed from hold", "resume"],
    resumeMentionsBefore,
    `Expected the timeline to record a resume event for ${orderNumber}.`
  );

  const assignmentAfterResume = await getAssignmentSnapshot(page);
  expect(assignmentAfterResume).toEqual(assignmentBeforeHold);

  const holdMentionsAfterResume = await countTimelineMentions(page, ["placed on hold", "on hold"]);
  const resumeMentionsAfterResume = await countTimelineMentions(page, ["resumed from hold", "resume"]);

  // Refresh to prove the centralized workflow state persisted instead of drifting after the resume.
  await page.reload();
  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute("data-order-number", orderNumber);
  await expectDetailWorkflowState(page, activeStage.restoredStatus);
  await expectQueueWorkflowState(
    queuePage,
    orderNumber,
    activeStage.queueFilterKey,
    activeStage.restoredStatus
  );
  await expect(page.getByTestId("production-hold-indicator")).toHaveCount(0);
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(getWorkflowActionButton(page, activeStage.nextActionKey)).toHaveAttribute(
    "data-blocked",
    "false"
  );
  await expect(await getAssignmentSnapshot(page)).toEqual(assignmentBeforeHold);
  await expect(await countTimelineMentions(page, ["placed on hold", "on hold"])).toBe(
    holdMentionsAfterResume
  );
  await expect(await countTimelineMentions(page, ["resumed from hold", "resume"])).toBe(
    resumeMentionsAfterResume
  );

  await queuePage.close();
});
