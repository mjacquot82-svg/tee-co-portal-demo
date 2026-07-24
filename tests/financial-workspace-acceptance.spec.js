// @ts-check
import { expect, test } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

test("Financial keeps daily money attention ahead of reporting and reconciliation", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/InvoicesPayments.jsx", import.meta.url), "utf8")
  );
  const orderDetailSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")
  );

  const depositIndex = source.indexOf('title="Awaiting Deposit"');
  const balanceIndex = source.indexOf('title="Awaiting Balance"');
  const failedIndex = source.indexOf('title="Failed Payments"');
  const recordsIndex = source.indexOf('title="Financial Records and Review"');

  expect(recordsIndex).toBeGreaterThan(-1);
  expect(depositIndex).toBeGreaterThan(recordsIndex);
  expect(balanceIndex).toBeGreaterThan(depositIndex);
  expect(failedIndex).toBeGreaterThan(balanceIndex);
  expect(source).not.toContain("<PaymentRequestForm");
  expect(source).toContain('actionLabel: "Follow Up on Payment"');
  expect(source).toContain('actionLabel: "Create Payment Request"');
  expect(source).toContain("?workspace=financial#owner-payment-request-form");
  expect(orderDetailSource).toContain('window.location.hash !== "#owner-payment-request-form"');
  expect(orderDetailSource).toContain('.getElementById("owner-payment-request-form")');

  [
    "Open Payment Requests",
    "Partially Paid Orders",
    "Paid Orders",
    "Recent Payment Activity",
    "Phase 2 admin layer",
    "native payment requests",
    "legacy order records",
    "production gating",
    "current projections",
  ].forEach((removedPresentation) => expect(source).not.toContain(removedPresentation));
});

test("Financial renders one business-facing table for deposits and balances", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin/financial");
  await loginThroughOperationalPin(page, config, "/admin/financial");

  await expect(page.getByRole("heading", { name: "Money Needing Attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Awaiting Deposit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Awaiting Balance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Failed Payments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Payment Request" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Financial Records and Review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paid Orders" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recent Payment Activity" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View Payment History" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review Payment Matching" })).toBeVisible();

  await page.getByRole("button", { name: "Go to Awaiting Balance" }).click();
  await expect(page.locator("#awaiting-balance")).toHaveCSS("background-color", "rgb(255, 251, 235)");
});
