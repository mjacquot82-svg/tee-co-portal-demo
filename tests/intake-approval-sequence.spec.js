// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { getAvailableIntakeActions } from "../src/admin/intakeActionPresentation.js";
import {
  assertIntakeRequestApprovalAllowed,
  canApproveIntakeRequest,
  getIntakeApprovalEligibility,
} from "../src/quotes/intakeApprovalGuard.js";

const pendingRequest = {
  staff_review_status: "Pending",
  approval_status: "Pending",
  artwork_status: "Pending Review",
  artwork_approval_status: "Pending Review",
  deposit_requirement: "undecided",
  deposit_requirement_status: "Undecided",
  deposit_workflow_status: "Pending Decision",
};

test("Approve Request is unavailable until artwork and deposit decisions are complete", () => {
  expect(getIntakeApprovalEligibility(pendingRequest)).toMatchObject({
    allowed: false,
    artworkComplete: false,
    depositDecisionComplete: false,
    blockers: ["Artwork Review", "Deposit Decision"],
  });
  expect(getAvailableIntakeActions(pendingRequest).approveRequest).toBe(false);
  expect(() => assertIntakeRequestApprovalAllowed(pendingRequest)).toThrow(
    /Artwork Review and Deposit Decision/
  );
});

test("artwork approval alone does not unlock Approve Request", () => {
  const order = {
    ...pendingRequest,
    artwork_status: "Approved",
    artwork_approval_status: "Approved",
  };

  expect(canApproveIntakeRequest(order)).toBe(false);
  expect(getAvailableIntakeActions(order).approveRequest).toBe(false);
  expect(() => assertIntakeRequestApprovalAllowed(order)).toThrow(/Deposit Decision/);
});

test("deposit decision alone does not unlock Approve Request", () => {
  const order = {
    ...pendingRequest,
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_requirement_status: "Not Required",
    deposit_workflow_status: "Deposit Not Required",
  };

  expect(canApproveIntakeRequest(order)).toBe(false);
  expect(getAvailableIntakeActions(order).approveRequest).toBe(false);
  expect(() => assertIntakeRequestApprovalAllowed(order)).toThrow(/Artwork Review/);
});

test("artwork approval and either deposit decision unlock Approve Request", () => {
  const artworkApproved = {
    ...pendingRequest,
    artwork_status: "Approved",
    artwork_approval_status: "Approved",
  };
  const depositRequired = {
    ...artworkApproved,
    deposit_required: true,
    deposit_requirement: "required",
    deposit_workflow_status: "Deposit Requested",
  };
  const depositWaived = {
    ...artworkApproved,
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_workflow_status: "Deposit Not Required",
  };

  for (const order of [depositRequired, depositWaived]) {
    expect(canApproveIntakeRequest(order)).toBe(true);
    expect(getAvailableIntakeActions(order).approveRequest).toBe(true);
    expect(() => assertIntakeRequestApprovalAllowed(order)).not.toThrow();
  }
});

test("already-approved legacy requests remain grandfathered", () => {
  const legacyApproved = {
    ...pendingRequest,
    staff_review_status: "Approved",
    approval_status: "Approved",
  };

  expect(canApproveIntakeRequest(legacyApproved)).toBe(true);
  expect(getAvailableIntakeActions(legacyApproved).approveRequest).toBe(false);
  expect(() => assertIntakeRequestApprovalAllowed(legacyApproved)).not.toThrow();
});

test("UI handler and persistence boundary both enforce the shared approval guard", () => {
  const detailSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/admin/QuoteDetail.jsx"),
    "utf8"
  );
  const storeSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/ordersStore.js"),
    "utf8"
  );

  expect(detailSource).toContain("assertIntakeRequestApprovalAllowed(order)");
  expect(storeSource).toContain("requestsIntakeApproval");
  expect(storeSource).toContain("assertIntakeRequestApprovalAllowed(currentOrder)");
});

test("workflow presentation orders artwork, deposit, then approval without step numbers", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/admin/QuoteDetail.jsx"),
    "utf8"
  );
  const artworkIndex = source.indexOf('key: "artwork-review"');
  const depositIndex = source.indexOf('key: "deposit-decision"');
  const approvalIndex = source.indexOf('key: "approve-request"');

  expect(artworkIndex).toBeGreaterThan(-1);
  expect(depositIndex).toBeGreaterThan(artworkIndex);
  expect(approvalIndex).toBeGreaterThan(depositIndex);
  expect(source).not.toContain("Step 1");
  expect(source).not.toContain("Step 2");
  expect(source).not.toContain("Step 3");
});

