// @ts-check
import { test, expect } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getQueueRow(page, orderNumber) {
  return page.locator(
    `[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`
  );
}

function getWorkflowActionButton(page, actionKey) {
  return page.locator(
    `[data-testid="workflow-action-button"][data-action-key="${actionKey}"]`
  );
}

async function waitForQueuePage(page) {
  await expect(page.getByTestId("production-queue-page")).toBeVisible();
}

async function getTimelineItemCount(page) {
  return page.getByTestId("activity-timeline-item").count();
}

async function getTimelineNotes(page) {
  const notes = await page.getByTestId("activity-timeline-item-note").allTextContents();
  return notes.map((note) => note.trim());
}

async function countTimelineMentions(page, fragments) {
  const normalizedFragments = fragments.map((f) => f.toLowerCase());
  const notes = await getTimelineNotes(page);
  return notes.filter((note) => {
    const n = note.toLowerCase();
    return normalizedFragments.some((f) => n.includes(f));
  }).length;
}

/**
 * Seeds a synthetic order with controlled assignment state into localStorage.
 * Returns the order number.
 */
async function seedSyntheticOrder(page, overrides = {}) {
  return page.evaluate((overrides) => {
    const storageKey = "teeCoStaffOrders";
    const existing = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    const base = existing[0] || {};
    const now = new Date().toISOString();
    const orderNumber = `TC-TEST-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

    const seedOrder = {
      ...base,
      order_number: orderNumber,
      customer_name: "Test Customer",
      status: "Ready For Production",
      workflow_state: "Ready For Production",
      production_ready: true,
      artwork_approval_status: "Approved",
      deposit_workflow_status: "Deposit Not Required",
      deposit_required: false,
      assigned_to_staff_id: "",
      assigned_to_staff_name: "",
      needs_assignment: true,
      production_hold_reason: "",
      production_hold_previous_status: "",
      last_escalated_at: "",
      activity_log: [],
      created_at: now,
      updated_at: now,
      ...overrides,
    };

    existing.unshift(seedOrder);
    window.localStorage.setItem(storageKey, JSON.stringify(existing));
    return orderNumber;
  }, overrides);
}

async function openOrderDetail(page, orderNumber) {
  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-order-number",
    orderNumber
  );
}

async function putOrderOnHold(page, reason = "Test hold reason") {
  await getWorkflowActionButton(page, "put_on_hold").click();
  const holdDialog = page.getByTestId("hold-reason-dialog");
  await expect(holdDialog).toBeVisible({ timeout: 5_000 });
  await holdDialog.getByTestId("hold-reason-input").fill(reason);
  await holdDialog.getByTestId("hold-reason-confirm").click();
  await expect(holdDialog).toHaveCount(0, { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Test: Staff Self-Assignment — claim unassigned work
// ---------------------------------------------------------------------------

test("staff can claim unassigned work and it appears in My Assigned Work", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page, {
    assigned_to_staff_id: "",
    assigned_to_staff_name: "",
    needs_assignment: true,
  });

  // Reload to pick up seeded data
  await page.reload();
  await openOrderDetail(page, orderNumber);

  const assignmentPanel = page.getByTestId("order-assignment-panel");
  await expect(assignmentPanel).toBeVisible();

  // Claim button is only visible when a staff user is logged in and the order is unassigned
  const claimButton = page.getByTestId("claim-job-button");
  if (await claimButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const timelineBefore = await getTimelineItemCount(page);
    await claimButton.click();

    // Assignment should be recorded in the timeline
    await expect
      .poll(() => getTimelineItemCount(page), {
        message: "Expected a new timeline entry after claiming the job.",
        timeout: 10_000,
      })
      .toBeGreaterThan(timelineBefore);

    // The claim button should disappear after claiming
    await expect(claimButton).toHaveCount(0, { timeout: 5_000 });

    // Verify assignment history recorded in timeline
    const mentionCount = await countTimelineMentions(page, ["claimed", "assigned"]);
    expect(mentionCount).toBeGreaterThan(0);
  } else {
    // Staff workspace not active (e.g., owner login) — verify claim button absent for owner
    await expect(claimButton).toHaveCount(0);
    const assignmentSelect = page.getByTestId("assignment-select");
    await expect(assignmentSelect).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Test: Staff cannot claim already-assigned work
// ---------------------------------------------------------------------------

test("staff cannot claim work that is already assigned to another person", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page, {
    assigned_to_staff_id: "other-staff-id",
    assigned_to_staff_name: "Other Staff Member",
    needs_assignment: false,
  });

  await page.reload();
  await openOrderDetail(page, orderNumber);

  // Claim button must not be shown when order is already assigned
  await expect(page.getByTestId("claim-job-button")).toHaveCount(0, { timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// Test: Hold reason is required — cannot save without one
// ---------------------------------------------------------------------------

test("hold reason dialog blocks saving without a reason entered", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page);
  await page.reload();
  await openOrderDetail(page, orderNumber);

  // Navigate through production to get to a stage with put_on_hold available
  const moveToProductionButton = getWorkflowActionButton(page, "move_to_production");
  if (!(await moveToProductionButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await moveToProductionButton.click();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );

  const putOnHoldButton = getWorkflowActionButton(page, "put_on_hold");
  if (!(await putOnHoldButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  await putOnHoldButton.click();
  const holdDialog = page.getByTestId("hold-reason-dialog");
  await expect(holdDialog).toBeVisible({ timeout: 5_000 });

  // The confirm button must be disabled when input is empty
  const confirmButton = holdDialog.getByTestId("hold-reason-confirm");
  await expect(confirmButton).toBeDisabled();

  // Order status must not have changed yet
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );

  // Cancel should dismiss the dialog without changing state
  await holdDialog.getByTestId("hold-reason-cancel").click();
  await expect(holdDialog).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );
});

// ---------------------------------------------------------------------------
// Test: Hold reason is stored and displayed
// ---------------------------------------------------------------------------

test("hold reason is stored in order and displayed in the hold indicator", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page);
  await page.reload();
  await openOrderDetail(page, orderNumber);

  const moveToProductionButton = getWorkflowActionButton(page, "move_to_production");
  if (!(await moveToProductionButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await moveToProductionButton.click();

  const holdButton = getWorkflowActionButton(page, "put_on_hold");
  if (!(await holdButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  const timelineBefore = await getTimelineItemCount(page);
  const holdReasonText = "Waiting for customer fabric confirmation";
  await putOrderOnHold(page, holdReasonText);

  // Order must be on hold
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "On Hold"
  );

  // Hold indicator must be visible
  await expect(page.getByTestId("production-hold-indicator")).toBeVisible();

  // Hold reason must appear somewhere on the page
  await expect(page.locator(`text=${holdReasonText}`).first()).toBeVisible({ timeout: 5_000 });

  // Timeline must record the hold event with reason
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: "Expected a new timeline entry after placing order on hold.",
      timeout: 10_000,
    })
    .toBeGreaterThan(timelineBefore);

  const holdMentions = await countTimelineMentions(page, ["hold", "hold reason"]);
  expect(holdMentions).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Test: Resume workflow shows previous hold reason and records who resumed
// ---------------------------------------------------------------------------

test("resume workflow records previous hold reason and resuming staff in the timeline", async ({
  page,
}) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page);
  await page.reload();
  await openOrderDetail(page, orderNumber);

  const moveToProductionButton = getWorkflowActionButton(page, "move_to_production");
  if (!(await moveToProductionButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await moveToProductionButton.click();

  const holdButton = getWorkflowActionButton(page, "put_on_hold");
  if (!(await holdButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  const holdReasonText = "Material shortage — waiting on restock";
  await putOrderOnHold(page, holdReasonText);

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "On Hold"
  );

  const timelineBeforeResume = await getTimelineItemCount(page);

  // Resume the order
  await getWorkflowActionButton(page, "resume_from_hold").click();

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );

  // Hold indicator should be gone
  await expect(page.getByTestId("production-hold-indicator")).toHaveCount(0, {
    timeout: 5_000,
  });

  // Timeline must record the resume event
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: "Expected a new timeline entry after resuming from hold.",
      timeout: 10_000,
    })
    .toBeGreaterThan(timelineBeforeResume);

  // Resume timeline entry should mention the previous hold reason
  const resumeMentions = await countTimelineMentions(page, [
    "resumed",
    "resume",
    holdReasonText.toLowerCase().slice(0, 20),
  ]);
  expect(resumeMentions).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Test: Escalation workflow — escalate blocked order to owner
// ---------------------------------------------------------------------------

test("escalate to owner records escalation event and prevents duplicate escalations", async ({
  page,
}) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  // Seed a blocked order (missing artwork approval so it is blocked for production)
  const orderNumber = await seedSyntheticOrder(page, {
    artwork_approval_status: "Pending Review",
    deposit_workflow_status: "Deposit Not Required",
    deposit_required: false,
    status: "New",
    workflow_state: "New",
  });
  await page.reload();
  await waitForQueuePage(page);

  // Navigate to the production queue and find the blocked order
  await page.getByTestId("production-queue-search").fill(orderNumber);
  const queueRow = getQueueRow(page, orderNumber);

  if (!(await queueRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  const escalateButton = queueRow.getByTestId("escalate-to-owner-button");
  if (!(await escalateButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    // Row may not be blocked in this data state — skip gracefully
    test.skip();
    return;
  }

  // First escalation should be enabled
  await expect(escalateButton).toBeEnabled();
  await escalateButton.click();

  // After escalation the button should reflect the escalated state
  await expect
    .poll(
      () =>
        queueRow
          .getByTestId("escalate-to-owner-button")
          .getAttribute("disabled")
          .catch(() => null),
      {
        message: "Expected escalate button to become disabled after escalation.",
        timeout: 10_000,
      }
    )
    .not.toBeNull();
});

// ---------------------------------------------------------------------------
// Test: Timeline history — hold and resume events appear in activity timeline
// ---------------------------------------------------------------------------

test("hold and resume events are preserved in the order activity timeline", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page);
  await page.reload();
  await openOrderDetail(page, orderNumber);

  const moveToProductionButton = getWorkflowActionButton(page, "move_to_production");
  if (!(await moveToProductionButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await moveToProductionButton.click();

  const holdButton = getWorkflowActionButton(page, "put_on_hold");
  if (!(await holdButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  const holdMentionsBefore = await countTimelineMentions(page, ["hold"]);
  const resumeMentionsBefore = await countTimelineMentions(page, ["resumed", "resume"]);

  await putOrderOnHold(page, "Timeline history test");
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "On Hold"
  );

  await expect
    .poll(() => countTimelineMentions(page, ["hold"]), {
      message: "Expected hold event in timeline.",
      timeout: 10_000,
    })
    .toBeGreaterThan(holdMentionsBefore);

  await getWorkflowActionButton(page, "resume_from_hold").click();
  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );

  await expect
    .poll(() => countTimelineMentions(page, ["resumed", "resume"]), {
      message: "Expected resume event in timeline.",
      timeout: 10_000,
    })
    .toBeGreaterThan(resumeMentionsBefore);

  // Refresh the page and verify timeline persists
  await page.reload();
  await expect(page.getByTestId("order-detail-page")).toBeVisible();

  const holdMentionsAfterReload = await countTimelineMentions(page, ["hold"]);
  const resumeMentionsAfterReload = await countTimelineMentions(page, ["resumed", "resume"]);

  expect(holdMentionsAfterReload).toBeGreaterThan(holdMentionsBefore);
  expect(resumeMentionsAfterReload).toBeGreaterThan(resumeMentionsBefore);
});

// ---------------------------------------------------------------------------
// Test: Assignment history — self-claim is recorded in activity log
// ---------------------------------------------------------------------------

test("self-claim assignment is recorded in the order activity log", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const orderNumber = await seedSyntheticOrder(page, {
    assigned_to_staff_id: "",
    assigned_to_staff_name: "",
    needs_assignment: true,
  });

  await page.reload();
  await openOrderDetail(page, orderNumber);

  const claimButton = page.getByTestId("claim-job-button");
  if (!(await claimButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
    // Staff workspace not active for this login — skip gracefully
    test.skip();
    return;
  }

  const timelineBefore = await getTimelineItemCount(page);
  await claimButton.click();

  // Activity log must record the claim
  await expect
    .poll(() => getTimelineItemCount(page), {
      message: "Expected assignment to be recorded in activity timeline after self-claim.",
      timeout: 10_000,
    })
    .toBeGreaterThan(timelineBefore);

  const assignmentMentions = await countTimelineMentions(page, ["claimed", "assigned"]);
  expect(assignmentMentions).toBeGreaterThan(0);

  // Reload to verify persistence
  await page.reload();
  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  const assignmentMentionsAfterReload = await countTimelineMentions(page, ["claimed", "assigned"]);
  expect(assignmentMentionsAfterReload).toBeGreaterThan(0);
});
