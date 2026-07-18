// @ts-check
import { expect, test } from "@playwright/test";
import { buildIntakeActionConfirmation } from "../src/admin/workflowCopy.js";

const expectedConfirmations = [
  ["approve_request", "✓ Request approved.", "Approved — pending remaining requirements", "customer", "Next step:"],
  ["request_artwork", "✓ Artwork requested.", "Awaiting artwork", "Customer Portal", "Next step:"],
  ["approve_artwork", "✓ Artwork approved.", "Artwork approved", "requirement", "Next step:"],
  ["request_changes", "✓ Changes requested.", "Awaiting customer response", "Customer Portal", "Next step:"],
  ["require_deposit", "✓ Deposit request created.", "Awaiting deposit", "Customer Portal", "Next step:"],
  ["deposit_not_required", "✓ Deposit marked not required.", "No deposit is required", "customer", "Next step:"],
  ["reject_request", "✓ Request rejected.", "Request canceled", "closed", "Next step:"],
];

for (const [actionKey, action, state, customerImpact, nextStep] of expectedConfirmations) {
  test(`${actionKey} confirmation explains the completed action and resulting workflow`, () => {
    const confirmation = buildIntakeActionConfirmation(actionKey);

    expect(confirmation).toContain(action);
    expect(confirmation).toContain(state);
    expect(confirmation.toLowerCase()).toContain(customerImpact.toLowerCase());
    expect(confirmation).toContain(nextStep);
  });
}

test("the intake screen renders workflow confirmations in its live region", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="intake-workflow-confirmation"');
  expect(source).toContain('aria-live="polite"');
  expect(source).toContain('whiteSpace: "pre-line"');
  expect(source).toContain('buildIntakeActionConfirmation("deposit_not_required")');
  expect(source).toContain('buildIntakeActionConfirmation("reject_request")');
});
