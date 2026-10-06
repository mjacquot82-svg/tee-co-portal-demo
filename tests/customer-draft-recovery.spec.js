import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("durable customer draft recovery stays wired", () => {
  const storeSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/pendingCustomerRequestStore.js"),
    "utf8"
  );
  const requestSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );

  expect(storeSource).toContain('storage: "local"');
  expect(storeSource).toContain("needByDate:");
  expect(storeSource).toContain("additionalInstructions:");
  expect(requestSource).toContain("setNeedByDate(pendingRequest.needByDate)");
  expect(requestSource).toContain("setAdditionalInstructions(pendingRequest.additionalInstructions)");
  expect(requestSource).toContain("persistFinalReviewFields({ needByDate: value })");
  expect(requestSource).toContain("persistFinalReviewFields({ additionalInstructions: value })");
});
