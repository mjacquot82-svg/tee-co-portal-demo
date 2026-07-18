// @ts-check
import { expect, test } from "@playwright/test";
import {
  getAvailableIntakeActions,
  getCompletedIntakeActions,
} from "../src/admin/intakeActionPresentation.js";

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
    approveArtwork: false,
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

test("a received deposit no longer offers the contradictory deposit waiver", () => {
  expect(getAvailableIntakeActions({
    deposit_required: true,
    deposit_requirement: "required",
    deposit_workflow_status: "Deposit Received",
  })).toMatchObject({
    requireDeposit: false,
    markDepositNotRequired: false,
  });
});

test("uploaded artwork awaiting review offers approval as the next action", () => {
  const order = {
    artwork_status: "Pending Review",
    artwork_approval_status: "Pending Review",
    artwork_files: [{ id: "asset-1", file_name: "logo.png", asset_url: "https://example.com/logo.png" }],
  };

  expect(getAvailableIntakeActions(order)).toMatchObject({
    approveArtwork: true,
    requestArtwork: false,
  });
});

test("approved artwork is completed and no longer offers artwork actions", () => {
  const order = {
    artwork_status: "Approved",
    artwork_approval_status: "Approved",
    artwork_files: [{ id: "asset-1", file_name: "logo.png", asset_url: "https://example.com/logo.png" }],
  };

  expect(getCompletedIntakeActions(order).approveArtwork).toBe(true);
  expect(getAvailableIntakeActions(order)).toMatchObject({
    approveArtwork: false,
    requestArtwork: false,
  });
});

test("the intake UI renders completion indicators and conditionally omits completed buttons", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="intake-completed-actions"');
  expect(source).toContain("Completed");
  expect(source).toContain("Available Actions");
  expect(source).toContain("availableActions.approveRequest");
  expect(source).toContain("availableActions.approveArtwork");
  expect(source).toContain("availableActions.requestArtwork");
  expect(source).toContain("availableActions.requestChanges");
  expect(source).toContain("availableActions.requireDeposit");
  expect(source).toContain("availableActions.markDepositNotRequired");
  expect(source).toContain('artwork_approval_status: "Approved"');
  expect(source).toContain('status: "Ready For Production"');
});
