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
    "Next Task",
    "Completed Tasks",
    "Progress",
  ].forEach((label) => expect(source).toContain(label));

  expect(source).not.toContain("Remaining Tasks");
  expect(source).not.toContain("Process History");
  expect(source).not.toContain("availabilityReasons");

  expect(source).not.toContain("tee-co-dtf-production");
  expect(source).not.toContain("order-transfers");
  expect(source).not.toContain("Template Version");
  expect(source).not.toContain("Primary Action");
  expect(source).not.toContain("<button");
});

test("engine-backed production presentation does not derive execution state from legacy workflows", async () => {
  const [detailSource, assignmentSource, instructionsSource, financialSource] =
    await Promise.all(
      [
        "../src/admin/OrderDetail.jsx",
        "../src/order-detail/AssignmentPanel.jsx",
        "../src/order-detail/ProductionInstructionsPanel.jsx",
        "../src/order-detail/FinancialSummaryPanel.jsx",
      ].map((path) =>
        import("node:fs/promises").then((fs) => fs.readFile(new URL(path, import.meta.url), "utf8"))
      )
    );

  expect(detailSource).toContain('data-workflow-state={showLegacyProduction ? order.status || "" : ""}');
  expect(detailSource).toContain("const showLegacyProduction = processProjectionResolved && !hasProcessAuthority");
  expect(detailSource).toContain('data-testid="production-authority-loading"');
  expect(detailSource).toContain("<ProcessCurrentActionPanel");
  expect(detailSource).not.toContain("<ProductionProgressTracker");
  expect(detailSource).toContain("hasProcessAuthority ? (");
  expect(detailSource).toContain("<AssignmentOnlyPanel");
  expect(assignmentSource).not.toContain("compactWorkflowContext");
  expect(instructionsSource).not.toContain("buildDepositWorkflowLabel");
  expect(instructionsSource).not.toContain("Approval Status");
  expect(financialSource).not.toContain("canonical_workflow_state");
});

test("Order Detail presents process authority through the single next action", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("buildProcessInstanceProjection(result.processInstance)");
  expect(source).not.toContain("<ProductionProgressTracker");
  expect(source).toContain("<ProductionActionPanel");
  expect(source).toContain("actions={workflowActions}");
  expect(source).toContain('data-testid="production-job-identity"');
  expect(source).toContain('data-testid="order-workspace-tabs"');
  expect(source).toContain('data-testid="order-workspace-production"');
  expect(source).toContain('data-testid="order-workspace-financial"');
  expect(source).toContain('data-testid="order-workspace-details"');

  const jobIdentityIndex = source.indexOf('data-testid="production-job-identity"');
  const nextActionIndex = source.indexOf("<ProcessCurrentActionPanel");
  const garmentIndex = source.indexOf("<GarmentProductionCards");
  const notesIndex = source.indexOf("<ProductionInstructionsPanel");
  const financialWorkspaceIndex = source.indexOf('data-testid="order-workspace-financial"');
  const detailsWorkspaceIndex = source.indexOf('data-testid="order-workspace-details"');
  const activityTimelineIndex = source.lastIndexOf("<ActivityTimeline");

  expect(jobIdentityIndex).toBeGreaterThan(-1);
  expect(nextActionIndex).toBeGreaterThan(jobIdentityIndex);
  expect(garmentIndex).toBeGreaterThan(nextActionIndex);
  expect(notesIndex).toBeGreaterThan(garmentIndex);
  expect(financialWorkspaceIndex).toBeGreaterThan(notesIndex);
  expect(detailsWorkspaceIndex).toBeGreaterThan(financialWorkspaceIndex);
  expect(activityTimelineIndex).toBeGreaterThan(detailsWorkspaceIndex);

  expect(source).toContain('data-testid="quote-snapshot-disclosure"');
  expect(source).toContain('showInternalNotes={false}');
  expect(source).toContain("collapsedByDefault");
  expect(source).toContain('data-testid="production-job-header"');
  expect(source).toContain("<GarmentProductionCards order={order} />");
  expect(source).not.toContain("Production Reference");
});

test("production execution sections do not repeat order identity fields", async () => {
  const [source, garmentSource] = await import("node:fs/promises").then((fs) => Promise.all([
    fs.readFile(new URL("../src/order-detail/ProductionInstructionsPanel.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/order-detail/GarmentProductionCards.jsx", import.meta.url), "utf8"),
  ]));

  expect(source).not.toContain("Production Instructions");
  ["Customer", "Garment", "Production Type", "Quantity", "Due Date", "Placements"].forEach(
    (duplicatedField) => expect(source).not.toContain(`>${duplicatedField}<`)
  );
  expect(source).toContain('data-testid="production-notes"');
  expect(garmentSource).toContain('data-testid="garment-production-artwork"');
  expect(garmentSource).toContain('data-testid="garment-production-file"');
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
