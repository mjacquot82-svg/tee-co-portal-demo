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
    primaryCurrentTask: { name: "Order Transfers", state: "Available" },
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
    "Template Version",
    "Process State",
    "Current Task",
    "Available Tasks",
    "Blocked Tasks",
    "History",
  ].forEach((label) => expect(source).toContain(label));

  expect(source).not.toContain("tee-co-dtf-production");
  expect(source).not.toContain("order-transfers");
});

test("Order Detail passes the process projection only into the existing production tracker", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("buildProcessInstanceProjection(result.processInstance)");
  expect(source).toContain(
    "<ProductionProgressTracker order={order} processProjection={processProjection} />"
  );
});
