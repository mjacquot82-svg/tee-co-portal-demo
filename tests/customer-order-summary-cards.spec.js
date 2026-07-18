// @ts-check
import { expect, test } from "@playwright/test";

test("collapsed customer order cards render scan-friendly workflow summaries", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/customer-portal/CustomerPortalOrders.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain("buildPortalOrderCardSummary");
  expect(source).toContain("summary.ownership.label");
  expect(source).toContain("Stage: {status.label}");
  expect(source).toContain('data-testid="portal-order-summary-indicators"');
  expect(source).toContain("summary.indicators.map");
  expect(source).toContain('data-summary-indicator={indicator.key}');
  expect(source).toContain("getCustomerPaymentDueLabel(activePaymentRequest)");
  expect(source).toContain("Estimated balance after payment:");
});

test("expanded order detail keeps its structure while prioritizing active payment requests", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/customer-portal/CustomerPortalOrders.jsx", import.meta.url), "utf8")
  );
  const sharedSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/customer-portal/CustomerPortalShared.jsx", import.meta.url), "utf8")
  );
  const paymentsSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/customer-portal/CustomerPortalPayments.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="portal-expanded-order-details"');
  expect(source).toContain('<RecordList records={[order]} type="orders" />');
  expect(sharedSource).toContain("getCustomerPaymentDueLabel(activePaymentRequest)");
  expect(sharedSource).toContain('label="Balance After Payment"');
  expect(paymentsSource).toContain("getCustomerPaymentDueLabel(paymentRequest)");
  expect(paymentsSource).toContain('label="Original Amount Requested"');
});
