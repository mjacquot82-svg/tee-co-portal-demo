// @ts-check
import { expect, test } from "@playwright/test";
import {
  buildIntakeActionConfirmation,
  buildIntakeWorkflowSummary,
} from "../src/admin/workflowCopy.js";

const expectedConfirmations = [
  ["approve_request", "✓ Request approved."],
  ["request_artwork", "✓ Artwork requested."],
  ["approve_artwork", "✓ Artwork approved."],
  ["request_changes", "✓ Changes requested."],
  ["require_deposit", "✓ Deposit request created."],
  ["deposit_not_required", "✓ Deposit marked not required."],
  ["reject_request", "✓ Request rejected."],
];

const completeIntakeOrder = {
  staff_review_status: "Approved",
  artwork_status: "Approved",
  deposit_requirement: "not_required",
  deposit_requirement_status: "Not Required",
  deposit_workflow_status: "Deposit Not Required",
};

for (const [actionKey, action] of expectedConfirmations) {
  test(`${actionKey} confirmation identifies the completed action`, () => {
    const confirmation = buildIntakeActionConfirmation(actionKey, completeIntakeOrder);

    expect(confirmation).toContain(action);
    expect(confirmation).toContain("Workflow state:");
    expect(confirmation).toContain("Next step:");
  });
}

test("completed intake decisions produce one consistent completion message", () => {
  const confirmation = buildIntakeActionConfirmation("deposit_not_required", completeIntakeOrder);

  expect(confirmation).toContain("Workflow state: Intake review complete.");
  expect(confirmation).toContain("No remaining intake actions.");
  expect(confirmation).toContain("ready for the next business stage");
  expect(confirmation).not.toContain("pending remaining requirements");
  expect(confirmation).not.toContain("Review the artwork and deposit requirements");
});

test("immediate response, refresh, direct URL, and list return rebuild the same workflow summary", () => {
  const persistedOrderAfterApproval = { ...completeIntakeOrder, request_status: "Approved - Pending Requirements" };
  const renderPaths = [
    "immediate approval response",
    "browser refresh",
    "direct URL",
    "return from requests list",
  ];
  const summaries = renderPaths.map(() => buildIntakeWorkflowSummary(persistedOrderAfterApproval));

  expect(new Set(summaries).size).toBe(1);
  expect(summaries[0]).toContain("Workflow state: Intake review complete.");
  expect(summaries[0]).toContain("No remaining intake actions.");
  expect(summaries[0]).toContain("ready for the next business stage");
  expect(summaries[0]).not.toContain("pending remaining requirements");
  expect(summaries[0]).not.toContain("Review the artwork and deposit requirements");
});

test("incomplete intake messaging names only current outstanding requirements", () => {
  const confirmation = buildIntakeActionConfirmation("approve_request", {
    ...completeIntakeOrder,
    artwork_status: "Pending Review",
    deposit_requirement: "undecided",
    deposit_requirement_status: "Undecided",
    deposit_workflow_status: "Pending Decision",
  });

  expect(confirmation).toContain("Remaining requirements: Artwork Review, Deposit Decision.");
  expect(confirmation).toContain("Next step: Review the uploaded artwork.");
  expect(confirmation).not.toContain("Staff Review");
});

test("the intake screen renders workflow confirmations in its live region", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="intake-workflow-confirmation"');
  expect(source).toContain('aria-live="polite"');
  expect(source).toContain('whiteSpace: "pre-line"');
  expect(source).toContain("buildIntakeWorkflowSummary(order)");
  expect(source).toContain('"Intake Review Complete"');
  expect(source).toContain("{workflowSummary}\n      </section>");
  expect(source).toContain('buildIntakeActionConfirmation("deposit_not_required", { ...order, ...updates })');
  expect(source).toContain('buildIntakeActionConfirmation("reject_request", { ...order, ...updates })');
});
