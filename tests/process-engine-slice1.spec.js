// @ts-check
import { expect, test } from "@playwright/test";
import {
  createProcessInstanceFromTemplate,
  validateProcessTemplate,
} from "../src/process-engine/processDefinition.js";
import {
  configureProcessStoreForTests,
  ensureProcessInstance,
} from "../src/process-engine/processStore.js";
import {
  configureProcessRepositoryForTests,
  createProcessInstance as persistProcessInstance,
  findProcessInstance,
} from "../src/process-engine/processRepository.js";
import { PERSISTENCE_MODES } from "../src/lib/persistenceMode.js";
import {
  ensureTeeCoProductionProcess,
  isTeeCoDtfProcessEligible,
} from "../src/integrations/teeCoProductionProcess.js";
import { teeCoDtfProductionTemplate } from "../src/process-templates/teeCoDtfProduction.js";

function createDeterministicIdFactory() {
  let nextId = 0;
  return (prefix) => `${prefix}-${++nextId}`;
}

function createReadyDtfOrder(overrides = {}) {
  return {
    id: "order-id-1",
    order_number: "TC-PROCESS-1",
    status: "Ready For Production",
    staff_review_status: "Approved",
    approval_status: "Approved",
    decoration_type: "DTF",
    artwork_approval_required: true,
    artwork_approval_status: "Approved",
    deposit_required: false,
    deposit_workflow_status: "Deposit Not Required",
    ...overrides,
  };
}

test.afterEach(() => {
  configureProcessStoreForTests(null);
  configureProcessRepositoryForTests(null);
});

test("the published DTF process template contains only the approved version 1 sequence", () => {
  expect(validateProcessTemplate(teeCoDtfProductionTemplate)).toBe(
    teeCoDtfProductionTemplate
  );
  expect(teeCoDtfProductionTemplate).toMatchObject({
    key: "tee-co-dtf-production",
    currentVersion: { version: 1, status: "published" },
  });
  expect(teeCoDtfProductionTemplate.currentVersion.tasks.map((task) => task.name)).toEqual([
    "Order Transfers",
    "Receive Transfers",
    "Prepare Garments",
    "Heat Press",
    "Quality Check",
    "Package Order",
    "Release for Pickup",
  ]);
  expect(teeCoDtfProductionTemplate.currentVersion.dependencies).toHaveLength(6);
});

test("process creation initializes the first task available and every dependent task blocked", () => {
  const processInstance = createProcessInstanceFromTemplate({
    template: teeCoDtfProductionTemplate,
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "order-id-1",
    now: "2026-07-18T12:00:00.000Z",
    createIdentifier: createDeterministicIdFactory(),
  });

  expect(processInstance).toMatchObject({
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "order-id-1",
    templateKey: "tee-co-dtf-production",
    templateVersion: 1,
    state: "Active",
  });
  expect(processInstance.taskInstances).toHaveLength(7);
  expect(processInstance.taskInstances.map((task) => [task.taskDefinitionKey, task.state])).toEqual([
    ["order-transfers", "Available"],
    ["receive-transfers", "Blocked"],
    ["prepare-garments", "Blocked"],
    ["heat-press", "Blocked"],
    ["quality-check", "Blocked"],
    ["package-order", "Blocked"],
    ["release-for-pickup", "Blocked"],
  ]);
  expect(processInstance.history.map((event) => event.eventType)).toEqual([
    "process_created",
    "task_available",
  ]);
  expect(processInstance.templateSnapshot.dependencies).toEqual(
    teeCoDtfProductionTemplate.currentVersion.dependencies
  );
});

test("process instance creation is idempotent for the same subject and template", async () => {
  const instances = [];
  configureProcessStoreForTests({
    find: async (identity) =>
      instances.find(
        (instance) =>
          instance.applicationKey === identity.applicationKey &&
          instance.subjectType === identity.subjectType &&
          instance.subjectId === identity.subjectId &&
          instance.templateKey === identity.templateKey
      ) || null,
    create: async (instance) => {
      instances.push(instance);
      return instance;
    },
  });

  const request = {
    template: teeCoDtfProductionTemplate,
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "order-id-1",
  };
  const first = await ensureProcessInstance(request);
  const repeated = await ensureProcessInstance(request);

  expect(first.created).toBe(true);
  expect(repeated.created).toBe(false);
  expect(repeated.processInstance.id).toBe(first.processInstance.id);
  expect(instances).toHaveLength(1);
});

test("the process repository persists and finds the initialized aggregate", async () => {
  configureProcessRepositoryForTests({
    supabaseClient: null,
    supabaseConfigured: false,
    persistenceMode: PERSISTENCE_MODES.development,
  });
  const processInstance = createProcessInstanceFromTemplate({
    template: teeCoDtfProductionTemplate,
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "repository-order-1",
    createIdentifier: createDeterministicIdFactory(),
  });

  const created = await persistProcessInstance(processInstance);
  const repeated = await persistProcessInstance(processInstance);
  const found = await findProcessInstance({
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "repository-order-1",
    templateKey: "tee-co-dtf-production",
  });

  expect(created.id).toBe(processInstance.id);
  expect(repeated.id).toBe(processInstance.id);
  expect(found).toEqual(processInstance);
});

test("the Tee & Co adapter creates the DTF process only after existing prerequisites pass", async () => {
  const instances = [];
  configureProcessStoreForTests({
    find: async (identity) =>
      instances.find((instance) => instance.subjectId === identity.subjectId) || null,
    create: async (instance) => {
      instances.push(instance);
      return instance;
    },
  });

  expect(isTeeCoDtfProcessEligible(createReadyDtfOrder())).toBe(true);
  expect(
    isTeeCoDtfProcessEligible(createReadyDtfOrder({ staff_review_status: "Pending", approval_status: "Pending" }))
  ).toBe(false);
  expect(
    isTeeCoDtfProcessEligible(createReadyDtfOrder({ artwork_approval_status: "Pending Review" }))
  ).toBe(false);
  expect(
    isTeeCoDtfProcessEligible(createReadyDtfOrder({
      deposit_required: true,
      deposit_amount: 50,
      deposit_workflow_status: "Deposit Requested",
    }))
  ).toBe(false);
  expect(
    isTeeCoDtfProcessEligible(createReadyDtfOrder({ decoration_type: "Embroidery" }))
  ).toBe(false);

  const first = await ensureTeeCoProductionProcess(createReadyDtfOrder());
  const repeated = await ensureTeeCoProductionProcess(createReadyDtfOrder());

  expect(first.created).toBe(true);
  expect(repeated.created).toBe(false);
  expect(instances).toHaveLength(1);
  expect(instances[0]).toMatchObject({
    applicationKey: "tee-and-co",
    subjectType: "order",
    subjectId: "order-id-1",
    templateKey: "tee-co-dtf-production",
  });
});

test("persisted Ready for Production order writes evaluate the process integration", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/lib/ordersStore.js", import.meta.url), "utf8")
  );

  expect(source).toContain("await ensureTeeCoProductionProcess(persistedOrder)");
  expect(source).toContain("await ensureTeeCoProductionProcess(updatedOrder)");
});
