// @ts-check
import { expect, test } from "@playwright/test";
import { getCompletedIntakeActions } from "../src/admin/intakeActionPresentation.js";

test("a new request keeps every non-terminal intake action available", () => {
  expect(getCompletedIntakeActions({
    request_status: "Pending Staff Review",
    staff_review_status: "Pending",
    deposit_requirement: "undecided",
    deposit_workflow_status: "Pending Decision",
  })).toEqual({
    approveRequest: false,
    requestArtwork: false,
    requestChanges: false,
    requireDeposit: false,
    markDepositNotRequired: false,
  });
});

test("completed review actions are derived from their persisted workflow state", () => {
  expect(getCompletedIntakeActions({
    request_status: "Awaiting Customer Response",
    staff_review_status: "Approved",
    activity_log: [{ type: "artwork_request" }],
  })).toMatchObject({
    approveRequest: true,
    requestArtwork: true,
    requestChanges: true,
  });
});

test("a required deposit hides only the completed deposit action", () => {
  expect(getCompletedIntakeActions({
    deposit_required: true,
    deposit_requirement: "required",
    deposit_workflow_status: "Deposit Requested",
  })).toMatchObject({
    requireDeposit: true,
    markDepositNotRequired: false,
  });
});

test("a waived deposit hides only the completed waiver action", () => {
  expect(getCompletedIntakeActions({
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_workflow_status: "Deposit Not Required",
  })).toMatchObject({
    requireDeposit: false,
    markDepositNotRequired: true,
  });
});

test("the intake UI renders completion indicators and conditionally omits completed buttons", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="intake-completed-actions"');
  expect(source).toContain("Completed");
  expect(source).toContain("Available Actions");
  expect(source).toContain("!completedActions.approveRequest");
  expect(source).toContain("!completedActions.requestArtwork");
  expect(source).toContain("!completedActions.requestChanges");
  expect(source).toContain("!completedActions.requireDeposit");
  expect(source).toContain("!completedActions.markDepositNotRequired");
});
