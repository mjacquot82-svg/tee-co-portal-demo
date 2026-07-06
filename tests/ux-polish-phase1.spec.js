// @ts-check
import { expect, test } from "@playwright/test";
import { buildSidebarAttentionCounts } from "../src/layout/sidebarAttentionCounts.js";
import { buildDepositWorkflowLabel } from "../src/orders/depositWorkflowDisplay.js";
import { buildWorkflowProgressStages } from "../src/orders/workflowPresentation.js";

test("sidebar attention counts derive order request, production, and payment work from existing state", () => {
  const counts = buildSidebarAttentionCounts({
    operationalOrders: [
      {
        order_number: "TC-UX-1",
        operational_visible: false,
        quote_status: "Draft",
        status: "New",
      },
      {
        order_number: "TC-UX-2",
        operational_visible: true,
        status: "Ready For Production",
      },
    ],
    assignedOrders: [],
    paymentRequests: [
      {
        id: "payment-request-ux",
        order_number: "TC-UX-1",
        status: "sent",
        request_type: "deposit",
        amount_requested: 25,
      },
    ],
    payments: [],
    paymentEvents: [],
    reconciliationReviews: [],
  });

  expect(counts.orderRequests).toBe(1);
  expect(counts.productionOrders).toBe(1);
  expect(counts.payments).toBe(1);
});

test("deposit workflow label hides amount until requested and shows requested or received wording", () => {
  expect(buildDepositWorkflowLabel({
    deposit_amount: 50,
    deposit_workflow_status: "Pending Decision",
  })).toBe("Deposit Not Requested");

  expect(buildDepositWorkflowLabel({
    deposit_amount: 50,
    deposit_workflow_status: "Deposit Requested",
  })).toBe("$50.00 Requested");

  expect(buildDepositWorkflowLabel({
    deposit_amount: 50,
    deposit_workflow_status: "Deposit Received",
    deposit_applied: 50,
  })).toBe("$50.00 Received");
});

test("workflow progress stages use canonical payment and workflow state", () => {
  const stages = buildWorkflowProgressStages({
    status: "Ready For Production",
    quote_status: "Approved",
    deposit_required: true,
    deposit_amount: 50,
    deposit_workflow_status: "Deposit Received",
    total_amount: 200,
    total_paid: 50,
    deposit_applied: 50,
    artwork_approval_required: true,
    artwork_approval_status: "Approved",
  });
  const byKey = Object.fromEntries(stages.map((stage) => [stage.key, stage]));

  expect(byKey["quote-approved"].state).toBe("complete");
  expect(byKey["deposit-requested"].state).toBe("complete");
  expect(byKey["deposit-received"].state).toBe("complete");
  expect(byKey["artwork-review"].state).toBe("complete");
  expect(byKey.production.state).toBe("active");
  expect(byKey["ready-for-pickup"].state).toBe("pending");
});
