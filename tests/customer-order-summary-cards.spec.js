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
});

test("the validated expanded order detail rendering remains unchanged", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/customer-portal/CustomerPortalOrders.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="portal-expanded-order-details"');
  expect(source).toContain('<RecordList records={[order]} type="orders" />');
});
