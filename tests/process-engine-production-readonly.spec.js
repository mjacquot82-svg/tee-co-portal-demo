// @ts-check
import { expect, test } from "@playwright/test";
import { createProcessInstanceFromTemplate } from "../src/process-engine/processDefinition.js";
import { buildProcessInstanceProjection } from "../src/process-engine/processProjection.js";
import { teeCoDtfProductionTemplate } from "../src/process-templates/teeCoDtfProduction.js";

function createDeterministicIdFactory() {
  let nextId = 0;
  return (prefix) => `${prefix}-${++nextId}`;
}

function createTc115332Projection() {
  const processInstance = createProcessInstanceFromTemplate({
    template: teeCoDtfProductionTemplate,
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "TC-115332",
    now: "2026-07-18T12:00:00.000Z",
    createIdentifier: createDeterministicIdFactory(),
  });
  return buildProcessInstanceProjection(processInstance);
}

test("TC-115332 receives the expected read-only Slice 1 process projection", () => {
  const projection = createTc115332Projection();

  expect(projection).toMatchObject({
    processName: "DTF Production",
    templateVersion: 1,
    processState: "Active",
    primaryCurrentTask: {
      name: "Order Transfers",
      state: "Available",
      reason: "This task is available because it has no incomplete prerequisites.",
    },
    progress: { completed: 0, total: 7 },
  });
  expect(projection.availableTasks.map((task) => task.name)).toEqual(["Order Transfers"]);
  expect(projection.blockedTasks.map((task) => task.name)).toEqual([
    "Receive Transfers",
    "Prepare Garments",
    "Heat Press",
    "Quality Check",
    "Package Order",
    "Release for Pickup",
  ]);
  expect(projection.upcomingTasks).toMatchObject([
    { name: "Receive Transfers", reason: "Waiting for Order Transfers." },
  ]);
  expect(projection.completedTasks).toEqual([]);
  expect(projection.historySummary.map((event) => event.label)).toEqual([
    "Process Created",
    "Order Transfers Available",
  ]);
});

test("the existing production section presents projected engine information without implementation keys", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/order-detail/ProcessInstanceSummary.jsx", import.meta.url), "utf8")
  );

  [
    "Process",
    "What should Teresa do next?",
    "Process Status",
    "Current Task",
    "Task State",
    "Why this task is available",
    "Blocked Reason",
    "Upcoming Tasks",
    "Completed Tasks",
    "Progress",
  ].forEach((label) => expect(source).toContain(label));

  expect(source).not.toContain("Remaining Tasks");
  expect(source).not.toContain("Process History");

  expect(source).not.toContain("tee-co-dtf-production");
  expect(source).not.toContain("order-transfers");
  expect(source).not.toContain("Template Version");
  expect(source).not.toContain("Primary Action");
  expect(source).not.toContain("<button");
});

test("Order Detail passes the process projection only into the existing production tracker", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("buildProcessInstanceProjection(result.processInstance)");
  expect(source).toContain(
    "<ProductionProgressTracker order={order} processProjection={processProjection} />"
  );
  expect(source).toContain("workflowActions={processProjection ? [] : workflowActions}");
  expect(source).toContain('data-testid="production-job-identity"');
  expect(source).toContain('data-testid="supporting-order-information"');

  const jobIdentityIndex = source.indexOf('data-testid="production-job-identity"');
  const processWorkspaceIndex = source.indexOf(
    "<ProductionProgressTracker order={order} processProjection={processProjection} />"
  );
  const productionControlsIndex = source.indexOf('className="production-workspace-controls"');
  const supportingInformationIndex = source.indexOf('data-testid="supporting-order-information"');
  const productionReferenceIndex = source.indexOf("Production Reference");
  const activityTimelineIndex = source.lastIndexOf("<ActivityTimeline");

  expect(jobIdentityIndex).toBeGreaterThan(-1);
  expect(processWorkspaceIndex).toBeGreaterThan(jobIdentityIndex);
  expect(productionControlsIndex).toBeGreaterThan(processWorkspaceIndex);
  expect(supportingInformationIndex).toBeGreaterThan(productionControlsIndex);
  expect(productionReferenceIndex).toBeGreaterThan(supportingInformationIndex);
  expect(activityTimelineIndex).toBeGreaterThan(productionReferenceIndex);

  expect(source).toContain('data-testid="quote-snapshot-disclosure"');
  expect(source).toContain("collapsedByDefault");
});

test("Production Queue detail controls navigate to the full order details route", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/Orders.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("useNavigate");
  expect(source).toContain("navigate(`/admin/orders/${encodeURIComponent(order.order_number)}`)");
  expect(source).toContain('data-testid="production-queue-open-detail"');
  expect(source).toContain('data-testid="production-queue-row-details"');
  expect(source.match(/onClick=\{\(\) => onOpenDetail\(order\)\}/g)).toHaveLength(2);

  expect(source).toContain("onRunAction={handleRunAction}");
  expect(source).toContain("onEscalate={handleEscalate}");
  expect(source).toContain("onClaim={handleClaim}");
});
