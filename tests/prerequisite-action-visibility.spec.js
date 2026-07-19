import { test, expect } from "@playwright/test";
import { buildPrerequisitePresentation } from "../src/order-detail/prerequisitePresentation";

test("completed prerequisites show satisfied state and hide the controls that created it", () => {
  const presentation = buildPrerequisitePresentation({
    checks: [
      { key: "artworkApproval", label: "Artwork Approval", satisfied: true, statusLabel: "Approved" },
      { key: "depositRequirement", label: "Deposit", satisfied: true, statusLabel: "Deposit Received" },
    ],
  });

  expect(presentation.allSatisfied).toBe(true);
  expect(presentation.checks.map((check) => check.displayStatus)).toEqual([
    "✓ Artwork Approved",
    "✓ Deposit Received",
  ]);
  expect(presentation.artwork).toMatchObject({
    showApprove: false,
    showRequestRevision: true,
    showSelector: false,
    showOverride: false,
  });
  expect(presentation.deposit.showOverride).toBe(false);
});

test("incomplete prerequisites expose only controls that can advance or resolve their state", () => {
  const presentation = buildPrerequisitePresentation({
    checks: [
      { key: "artworkApproval", label: "Artwork Approval", satisfied: false, statusLabel: "Pending Review" },
      { key: "depositRequirement", label: "Deposit", satisfied: false, statusLabel: "Awaiting Deposit" },
    ],
  });

  expect(presentation.allSatisfied).toBe(false);
  expect(presentation.artwork).toMatchObject({
    showApprove: true,
    showRequestRevision: true,
    showSelector: true,
    showOverride: true,
  });
  expect(presentation.deposit.showOverride).toBe(true);
});

test("request revision is hidden while revision is already the current artwork state", () => {
  const presentation = buildPrerequisitePresentation({
    checks: [
      { key: "artworkApproval", label: "Artwork Approval", satisfied: false, statusLabel: "Needs Revision" },
    ],
  });

  expect(presentation.artwork.showApprove).toBe(true);
  expect(presentation.artwork.showRequestRevision).toBe(false);
});
