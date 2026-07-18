// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("public preview describes a handoff instead of a completed submission", () => {
  const source = readSource("src/pages/OrderPreview.jsx");

  expect(source).toContain("Continue to Secure Request Form");
  expect(source).toContain("Your request is not submitted yet.");
  expect(source).toContain("Selection Summary");
  expect(source).toContain("Estimated Total");
  expect(source).not.toContain("Submit Order Request");
});

test("authenticated request form identifies the final submission action", () => {
  const source = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(source).toContain("Selection ready for final review");
  expect(source).toContain("then use Submit Order Request to send them to Tee & Co.");
  expect(source).toContain('"Submit Order Request"');
});
