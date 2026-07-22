// @ts-check
import { expect, test } from "@playwright/test";
import {
  buildProductionReadiness,
  buildProductionReadyWorkflowUpdates,
} from "../src/quotes/productionReadiness.js";
import {
  buildQuoteSummary,
  matchesQuoteQueueFilter,
} from "../src/quotes/requestQueueReadiness.js";
import { buildOwnerWorkflowSnapshot } from "../src/dashboard/ownerDashboardQueues.js";
import {
  matchesProductionStatus,
  normalizeProductionOrder,
} from "../src/production/productionWorkspace.js";

function completedIntake(overrides = {}) {
  return {
    order_number: "REQ-CONSISTENCY-1",
    request_type: "Order Request",
    operational_visible: false,
    quote_status: "Awaiting Artwork Approval",
    status: "New",
    staff_review_status: "Approved",
    approval_status: "Approved",
    artwork_status: "Approved",
    artwork_approval_status: "Approved",
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_requirement_status: "Not Required",
    deposit_workflow_status: "Deposit Not Required",
    total_amount: 100,
    total_paid: 0,
    ...overrides,
  };
}

test("completed intake has one authoritative ready classification across request surfaces", () => {
  const order = completedIntake();
  const summary = buildQuoteSummary(order);

  expect(buildProductionReadiness(order, summary.financials).ready).toBe(true);
  expect(summary.readiness.ready).toBe(true);
  expect(matchesQuoteQueueFilter(order, summary, "ready")).toBe(true);
  expect(matchesQuoteQueueFilter(order, summary, "blocked")).toBe(false);
  expect(buildOwnerWorkflowSnapshot([order]).readyForProduction).toBe(1);
});

test("a completed intake remains release-ready when its legacy quote status is stale", () => {
  const staleStatusOrder = completedIntake({ quote_status: "Awaiting Artwork Approval" });
  const summary = buildQuoteSummary(staleStatusOrder);

  expect(summary.readiness.ready).toBe(true);
  expect(matchesQuoteQueueFilter(staleStatusOrder, summary, "ready")).toBe(true);
  expect(buildOwnerWorkflowSnapshot([staleStatusOrder]).readyForProduction).toBe(1);
});

test("the final intake decision synchronizes production eligibility for waived deposits", () => {
  const order = completedIntake({ quote_status: "Awaiting Deposit" });

  expect(buildProductionReadyWorkflowUpdates(order, order)).toEqual({
    status: "Ready For Production",
    quote_status: "Ready For Production",
    production_ready: true,
  });
});

test("a required deposit remains blocked until received while artwork is approved", () => {
  const awaitingDeposit = completedIntake({
    deposit_required: true,
    deposit_requirement: "required",
    deposit_requirement_status: "Required",
    deposit_workflow_status: "Deposit Requested",
    deposit_amount: 50,
  });
  expect(buildProductionReadiness(awaitingDeposit, awaitingDeposit).ready).toBe(false);
  expect(buildOwnerWorkflowSnapshot([awaitingDeposit]).readyForProduction).toBe(0);

  const paid = { ...awaitingDeposit, deposit_workflow_status: "Deposit Received", total_paid: 50 };
  expect(buildProductionReadiness(paid, paid).ready).toBe(true);
  expect(buildOwnerWorkflowSnapshot([paid]).readyForProduction).toBe(1);
});

test("released intake-ready work enters the Ready for Production production queue", () => {
  const released = normalizeProductionOrder({
    ...completedIntake(),
    ...buildProductionReadyWorkflowUpdates(completedIntake(), completedIntake()),
    operational_visible: true,
  });

  expect(released.production_readiness.statusKey).toBe("ready-for-production");
  expect(matchesProductionStatus(released, "ready-for-production")).toBe(true);
  expect(matchesProductionStatus(released, "blocked")).toBe(false);
});
