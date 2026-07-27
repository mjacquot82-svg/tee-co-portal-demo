// @ts-check
import { expect, test } from "@playwright/test";

test("completed intake distinguishes readiness from navigation to the production workspace", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="intake-production-handoff"');
  expect(source).toContain('eyebrow: "Production Ready"');
  expect(source).toContain('eyebrow: "Waiting for Customer"');
  expect(source).toContain("Production cannot begin until the required customer deposit is received.");
  expect(source).toContain('to={`/admin/orders/${order.order_number}#production-handoff`}');
  expect(source).toContain("Review Production Readiness");
  expect(source).not.toContain("Continue to Production");
  expect(source).toContain("View Production Queue");
});

test("the handoff target retains the existing production release action and assignment panel", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('id="production-handoff"');
  expect(source).toContain("<ProductionActionPanel");
  expect(source).toContain("actions={workflowActions}");
  expect(source).toContain("{assignmentPanel}");
  expect(source).toContain("onRunAction={handleWorkflowAction}");
});

test("order requests expose one authoritative interactive filter bar", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/Quotes.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="order-request-filter-bar"');
  expect(source).toContain('aria-label="Filter order requests"');
  expect(source).not.toContain("function SummaryCard");
  expect(source).not.toContain('<SummaryCard label="Open Requests"');
  expect(source).toContain('onClick={() => updateFilters({ queue: filter.key })}');
});

test("ready request cards prioritize the existing production release transition", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/Quotes.jsx", import.meta.url), "utf8")
  );

  expect(source).toContain('data-testid="quote-list-release-to-production"');
  expect(source).toContain("{summary.readiness.ready ? (");
  expect(source).toContain("onClick={() => handleReleaseToProduction(quote, summary)}");
  expect(source).toContain("if (!summary.readiness.ready) return;");
  expect(source).not.toContain("isQuoteReadyForProduction");
  expect(source).toContain('activity_type: "release_to_production"');
  expect(source).toContain('navigate(`/admin/orders/${quote.order_number}`');
});
