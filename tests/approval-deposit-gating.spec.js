// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTWORK_FIXTURE_PATH = path.resolve(__dirname, "../public/icon-192.png");

function getQueueRow(page, orderNumber) {
  return page.locator(`[data-testid="production-queue-row"][data-order-number="${orderNumber}"]`);
}

function getWorkflowActionButton(page, actionKey) {
  return page.locator(
    `[data-testid="workflow-action-button"][data-action-key="${actionKey}"]`
  );
}

function getWorkflowQuickAction(page, actionKey) {
  return page.locator(
    `[data-testid="workflow-quick-action"][data-action-key="${actionKey}"]`
  );
}

function getWorkflowGate(page, gateKey) {
  return page.locator(`[data-testid="workflow-gate"][data-gate-key="${gateKey}"]`);
}

function getWorkflowBadge(page, label) {
  return page.locator(`[data-testid="workflow-badge"][data-badge-label="${label}"]`);
}

function getWorkflowOverrideButton(page, overrideKey) {
  return page.locator(
    `[data-testid="workflow-override-button"][data-override-key="${overrideKey}"]`
  );
}

function getActiveOverride(page, overrideKey) {
  return page.locator(
    `[data-testid="workflow-active-override"][data-override-key="${overrideKey}"]`
  );
}

function getNewOrderSizeInput(page, sizeKey) {
  return page.locator(
    `[data-testid="new-order-size-input"][data-size-key="${sizeKey}"]`
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

async function openOrderDetailFromQueue(page, row, orderNumber) {
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
}

async function countTimelineMentions(page, fragments) {
  const normalizedFragments = fragments.map((fragment) => fragment.toLowerCase());
  const notes = await page.getByTestId("activity-timeline-item-note").allTextContents();

  return notes.filter((note) => {
    const normalized = note.toLowerCase();
    return normalizedFragments.some((fragment) => normalized.includes(fragment));
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

async function tryReuseEligibleApprovalGatingOrder(page, config) {
  await waitForQueuePage(page);
  await page.getByTestId("production-status-filter-active").click();

  if (config.productionOrderText) {
    await page.getByTestId("production-queue-search").fill(config.productionOrderText);
  }

  const candidateOrderNumbers = await page.getByTestId("production-queue-row").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("data-order-number") || "")
      .filter(Boolean)
      .slice(0, 12)
  );

  if (!candidateOrderNumbers.length) {
    return null;
  }

  for (const orderNumber of candidateOrderNumbers) {
    await focusQueueOnOrder(page, orderNumber, "active");
    const row = getQueueRow(page, orderNumber);
    await expect(row).toBeVisible();
    await openOrderDetailFromQueue(page, row, orderNumber);

    const artworkGate = getWorkflowGate(page, "artworkApproval");
    const depositGate = getWorkflowGate(page, "depositRequirement");
    const artworkRequired = await artworkGate.getAttribute("data-required");
    const artworkOverridden = await artworkGate.getAttribute("data-overridden");
    const depositOverridden = await depositGate.getAttribute("data-overridden");
    const activeOverrideCount = await page.getByTestId("workflow-active-override").count();
    const moveToProductionButton = getWorkflowActionButton(page, "move_to_production");
    const canMoveToProduction = await moveToProductionButton.isVisible().catch(() => false);
    const moveBlocked = canMoveToProduction
      ? await moveToProductionButton.getAttribute("data-blocked")
      : "true";

    if (
      canMoveToProduction &&
      moveBlocked === "false" &&
      artworkRequired === "true" &&
      artworkOverridden !== "true" &&
      depositOverridden !== "true" &&
      activeOverrideCount === 0
    ) {
      console.log(`[approval-deposit-gating] existing order reused: ${orderNumber}`);
      return { orderNumber };
    }

    await page.goto("/admin/orders");
    await waitForQueuePage(page);
  }

  return null;
}

async function selectExistingCustomerForNewOrder(page, customerText) {
  const customerSelect = page.getByTestId("new-order-existing-customer-select");
  await expect(customerSelect).toBeVisible();

  let target = null;
  await expect
    .poll(
      async () => {
        const options = await customerSelect.locator("option").evaluateAll((nodes) =>
          nodes.map((node) => ({
            value: node.value,
            label: (node.label || node.textContent || "").trim(),
          }))
        );
        target =
          options.find((option) =>
            option.label.toLowerCase().includes(customerText.trim().toLowerCase())
          ) || null;
        return Boolean(target?.value);
      },
      {
        message: `Expected an existing customer option containing "${customerText}" in the new-order workflow.`,
        timeout: 15_000,
      }
    )
    .toBe(true);

  if (!target?.value) {
    throw new Error(
      `Unable to find an existing customer option containing "${customerText}" in the real new-order workflow.`
    );
  }

  await customerSelect.selectOption(target.value);
  await expect(page.getByTestId("new-order-customer-name-input")).toHaveValue(
    new RegExp(customerText.trim(), "i")
  );
  return target.value;
}

async function chooseFirstRealProduct(page) {
  const productSelect = page.getByTestId("new-order-product-select");
  await expect(productSelect).toBeVisible();

  let firstProduct = null;
  await expect
    .poll(
      async () => {
        const options = await productSelect.locator("option").evaluateAll((nodes) =>
          nodes
            .map((node) => ({
              value: node.value,
              label: (node.label || node.textContent || "").trim(),
            }))
            .filter((option) => option.value)
        );
        firstProduct = options[0] || null;
        return Boolean(firstProduct?.value);
      },
      {
        message: "Expected at least one real product option in the new-order workflow.",
        timeout: 15_000,
      }
    )
    .toBe(true);

  if (!firstProduct?.value) {
    throw new Error("Unable to find a real product option in the new-order workflow.");
  }

  await productSelect.selectOption(firstProduct.value);
}

async function createOperationalQuoteThroughUi(page, config) {
  await page.goto("/admin/quotes/new");
  await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible();

  const customerId = await selectExistingCustomerForNewOrder(page, config.customerText);
  await chooseFirstRealProduct(page);

  const sizeInput = getNewOrderSizeInput(page, "M");
  const fallbackSizeInput = page.getByTestId("new-order-size-input").first();
  const quantityInput = (await sizeInput.count()) > 0 ? sizeInput : fallbackSizeInput;
  await quantityInput.fill("12");

  await page.getByTestId("new-order-artwork-upload-input").setInputFiles(ARTWORK_FIXTURE_PATH);
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();

  await page.getByTestId("new-order-no-deposit-radio").check();
  await page.getByTestId("new-order-save-button").click();

  await page.waitForURL("**/admin/quotes");
  const flash = page.getByTestId("quote-workflow-flash");
  await expect(flash).toBeVisible();
  const flashText = (await flash.textContent()) || "";
  const match = flashText.match(/Quote\s+([A-Z0-9-]+)\s+created successfully/i);

  if (!match?.[1]) {
    throw new Error(`Unable to determine the created quote number from flash text: ${flashText}`);
  }

  return {
    sourceOrderNumber: match[1],
    customerId,
  };
}

async function releaseQuoteIntoOperationalOrders(page, orderNumber) {
  await page.goto(`/admin/quotes/${orderNumber}`);
  await expect(page.getByRole("heading", { name: `Quote ${orderNumber}` })).toBeVisible();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const releaseButton = page.getByTestId("quote-detail-release-to-production");
    if (await releaseButton.isVisible().catch(() => false)) {
      await releaseButton.click();
      return;
    }

    const advanceButton = page.getByTestId("quote-detail-advance-status");
    if (await advanceButton.isVisible().catch(() => false)) {
      await advanceButton.click();
      continue;
    }

    throw new Error(`Quote ${orderNumber} could not advance to a releasable production state.`);
  }

  throw new Error(`Quote ${orderNumber} did not expose Release to Production after advancing.`);
}

async function duplicateOperationalOrderFromCustomerDetail(page, customerId, orderNumber) {
  await page.goto(`/admin/customers/${customerId}`);
  await expect(
    page.locator(
      `[data-testid="customer-order-repeat-button"][data-order-number="${orderNumber}"]`
    )
  ).toBeVisible();
  await page
    .locator(`[data-testid="customer-order-repeat-button"][data-order-number="${orderNumber}"]`)
    .click();

  await expect(page.getByTestId("order-detail-page")).toBeVisible();
  const duplicatedOrderNumber =
    (await page.getByTestId("order-detail-page").getAttribute("data-order-number")) || "";

  if (!duplicatedOrderNumber || duplicatedOrderNumber === orderNumber) {
    throw new Error(
      `Expected Repeat to open a fresh operational order instead of reusing ${orderNumber}.`
    );
  }

  return duplicatedOrderNumber;
}

async function provisionApprovalGatingOrder(page, config) {
  const { sourceOrderNumber, customerId } = await createOperationalQuoteThroughUi(page, config);
  await releaseQuoteIntoOperationalOrders(page, sourceOrderNumber);
  const orderNumber = await duplicateOperationalOrderFromCustomerDetail(
    page,
    customerId,
    sourceOrderNumber
  );

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-order-number",
    orderNumber
  );

  if ((await getWorkflowGate(page, "artworkApproval").getAttribute("data-satisfied")) !== "true") {
    await getWorkflowQuickAction(page, "approve_artwork").click();
    await expect(getWorkflowGate(page, "artworkApproval")).toHaveAttribute("data-satisfied", "true");
  }

  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "false"
  );

  console.log(`[approval-deposit-gating] test order provisioned: ${orderNumber}`);
  return { orderNumber };
}

async function findOrProvisionEligibleApprovalGatingOrder(page, config) {
  const existingOrder = await tryReuseEligibleApprovalGatingOrder(page, config);
  if (existingOrder) {
    return existingOrder;
  }

  return provisionApprovalGatingOrder(page, config);
}

async function openOperationalOrdersPage(page, config) {
  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");
  await waitForQueuePage(page);
}

test("approval and deposit gating blocks production until operational requirements are satisfied", async ({
  page,
}) => {
  const config = getOperationalConfig();

  await page.goto("/login?redirectTo=/admin/orders");
  await loginThroughOperationalPin(page, config, "/admin/orders");

  const { orderNumber } = await findOrProvisionEligibleApprovalGatingOrder(page, config);
  const initialDetailWorkflowState =
    (await page.getByTestId("order-detail-page").getAttribute("data-workflow-state")) || "New";

  const queuePage = await page.context().newPage();
  await openOperationalOrdersPage(queuePage, config);
  await focusQueueOnOrder(queuePage, orderNumber, "active");
  const initialQueueWorkflowState =
    (await getQueueRow(queuePage, orderNumber).getAttribute("data-workflow-state")) || "New";
  await expectQueueWorkflowState(queuePage, orderNumber, "active", initialQueueWorkflowState);

  await expect(getWorkflowGate(page, "artworkApproval")).toHaveAttribute("data-required", "true");
  await expect(getWorkflowGate(page, "artworkApproval")).toHaveAttribute("data-satisfied", "true");
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "false"
  );

  const revisionMentionsBefore = await countTimelineMentions(page, ["revision requested"]);
  await getWorkflowQuickAction(page, "request_revision").click();

  await expect(getWorkflowGate(page, "artworkApproval")).toHaveAttribute("data-satisfied", "false");
  await expect(getWorkflowGate(page, "artworkApproval").getByTestId("workflow-gate-status")).toContainText(
    "Needs Revision"
  );
  await expect(getWorkflowBadge(page, "Revision Needed")).toBeVisible();
  await expect(page.getByTestId("customer-workflow-message")).toContainText(
    "Revision requested by shop"
  );
  await expectTimelineMentionCountToIncrease(
    page,
    ["revision requested"],
    revisionMentionsBefore,
    `Expected a revision timeline entry for ${orderNumber}.`
  );

  const blockedMentionsBefore = await countTimelineMentions(page, [
    "production blocked",
    "awaiting approval",
  ]);
  await getWorkflowActionButton(page, "move_to_production").click();

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    initialDetailWorkflowState
  );
  await expectQueueWorkflowState(queuePage, orderNumber, "active", initialQueueWorkflowState);
  await expect(page.getByTestId("production-gating-alert")).toContainText(
    "Artwork approval required before production."
  );
  await expect(page.getByTestId("production-gating-alert")).toContainText(
    "Awaiting customer revision."
  );
  await expect(getWorkflowBadge(page, "Production Blocked")).toBeVisible();
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "true"
  );
  await expectTimelineMentionCountToIncrease(
    page,
    ["production blocked", "awaiting approval"],
    blockedMentionsBefore,
    `Expected a production blocked timeline entry for ${orderNumber}.`
  );

  const approvalMentionsBefore = await countTimelineMentions(page, ["artwork approved"]);
  await getWorkflowQuickAction(page, "approve_artwork").click();

  await expect(getWorkflowGate(page, "artworkApproval")).toHaveAttribute("data-satisfied", "true");
  await expect(getWorkflowGate(page, "artworkApproval").getByTestId("workflow-gate-status")).toContainText(
    "Approved"
  );
  await expect(getWorkflowBadge(page, "Artwork Approved")).toBeVisible();
  await expect(getWorkflowBadge(page, "Production Blocked")).toHaveCount(0);
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(page.getByTestId("customer-workflow-message")).toContainText("Order in progress");
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "false"
  );
  await expectTimelineMentionCountToIncrease(
    page,
    ["artwork approved"],
    approvalMentionsBefore,
    `Expected an artwork approval timeline entry for ${orderNumber}.`
  );

  const depositRequestedMentionsBefore = await countTimelineMentions(page, ["deposit requested"]);
  await getWorkflowQuickAction(page, "request_deposit").click();

  await expect(getWorkflowGate(page, "depositRequirement")).toHaveAttribute("data-required", "true");
  await expect(getWorkflowGate(page, "depositRequirement")).toHaveAttribute("data-satisfied", "false");
  await expect(getWorkflowGate(page, "depositRequirement").getByTestId("workflow-gate-status")).toContainText(
    "Deposit Requested"
  );
  await expect(getWorkflowBadge(page, "Awaiting Deposit")).toBeVisible();
  await expect(getWorkflowBadge(page, "Production Blocked")).toBeVisible();
  await expect(page.getByTestId("customer-workflow-message")).toContainText(
    "Deposit requested before production"
  );
  await expect(page.getByTestId("production-gating-alert")).toContainText(
    "Deposit must be received before production."
  );
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "true"
  );
  await expectTimelineMentionCountToIncrease(
    page,
    ["deposit requested"],
    depositRequestedMentionsBefore,
    `Expected a deposit request timeline entry for ${orderNumber}.`
  );

  const depositReceivedMentionsBefore = await countTimelineMentions(page, ["deposit received"]);
  await getWorkflowQuickAction(page, "mark_deposit_received").click();

  await expect(getWorkflowGate(page, "depositRequirement")).toHaveAttribute("data-satisfied", "true");
  await expect(getWorkflowGate(page, "depositRequirement").getByTestId("workflow-gate-status")).toContainText(
    "Deposit Received"
  );
  await expect(getWorkflowBadge(page, "Deposit Received")).toBeVisible();
  await expect(getWorkflowBadge(page, "Production Blocked")).toHaveCount(0);
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(page.getByTestId("customer-workflow-message")).toContainText("Order in progress");
  await expect(getWorkflowActionButton(page, "move_to_production")).toHaveAttribute(
    "data-blocked",
    "false"
  );
  await expectTimelineMentionCountToIncrease(
    page,
    ["deposit received"],
    depositReceivedMentionsBefore,
    `Expected a deposit received timeline entry for ${orderNumber}.`
  );

  const movedToProductionMentionsBefore = await countTimelineMentions(page, [
    "move to production",
    "ready for production",
    "production queue",
  ]);
  await getWorkflowActionButton(page, "move_to_production").click();

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );
  await expect(page.getByTestId("order-detail-current-status")).toContainText(
    "Ready For Production"
  );
  await expectQueueWorkflowState(
    queuePage,
    orderNumber,
    "ready-for-production",
    "Ready For Production"
  );
  await expect(page.getByTestId("customer-workflow-message")).toContainText("Ready for production");
  await expectTimelineMentionCountToIncrease(
    page,
    ["move to production", "ready for production", "production queue"],
    movedToProductionMentionsBefore,
    `Expected a production movement timeline entry for ${orderNumber}.`
  );

  await expect(getWorkflowOverrideButton(page, "depositRequirement")).toBeVisible();
  const overrideMentionsBefore = await countTimelineMentions(page, ["override used"]);
  await getWorkflowOverrideButton(page, "depositRequirement").click();

  await expect(getActiveOverride(page, "depositRequirement")).toBeVisible();
  await expectTimelineMentionCountToIncrease(
    page,
    ["override used"],
    overrideMentionsBefore,
    `Expected a workflow override timeline entry for ${orderNumber}.`
  );

  await page.reload();

  await expect(page.getByTestId("order-detail-page")).toHaveAttribute(
    "data-workflow-state",
    "Ready For Production"
  );
  await expect(getWorkflowGate(page, "artworkApproval").getByTestId("workflow-gate-status")).toContainText(
    "Approved"
  );
  await expect(getWorkflowGate(page, "depositRequirement").getByTestId("workflow-gate-status")).toContainText(
    "Deposit Received"
  );
  await expect(getActiveOverride(page, "depositRequirement")).toBeVisible();
  await expect(page.getByTestId("customer-workflow-message")).toContainText("Ready for production");
  await expect(page.getByTestId("production-gating-alert")).toHaveCount(0);
  await expect(getWorkflowActionButton(page, "start_printing")).toBeVisible();
  await expect(getWorkflowActionButton(page, "start_printing")).toHaveAttribute(
    "data-blocked",
    "false"
  );

  await queuePage.close();
});
