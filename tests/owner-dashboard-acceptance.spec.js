// @ts-check
import { expect, test } from "@playwright/test";
import { buildOwnerWorkspaceModel } from "../src/admin/Dashboard.jsx";
import { buildQuoteSummary, matchesQuoteQueueFilter } from "../src/quotes/requestQueueReadiness.js";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

function quote(overrides) {
  return {
    request_type: "Order Request",
    operational_visible: false,
    status: "New",
    ...overrides,
  };
}

test("owner dashboard counts match their filtered quote destinations", () => {
  const orders = [
    quote({ order_number: "REQ-1", quote_status: "Draft" }),
    quote({ order_number: "QUOTE-1", quote_status: "Sent" }),
    quote({
      order_number: "ART-REVIEW",
      quote_status: "Awaiting Artwork Approval",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      artwork_files: [{ id: "art-1" }],
    }),
    quote({
      order_number: "ART-CUSTOMER",
      quote_status: "Awaiting Artwork Approval",
      artwork_approval_required: true,
      artwork_approval_status: "Needs Revision",
    }),
    quote({
      order_number: "DEPOSIT-REQUEST",
      quote_status: "Sent",
      deposit_required: true,
      deposit_amount: 100,
      deposit_workflow_status: "Deposit Not Requested",
    }),
    quote({ order_number: "AWAITING-APPROVAL", quote_status: "Awaiting Approval" }),
    quote({
      order_number: "AWAITING-DEPOSIT",
      quote_status: "Awaiting Deposit",
      deposit_required: true,
      deposit_amount: 100,
      deposit_workflow_status: "Deposit Requested",
    }),
  ];
  const model = buildOwnerWorkspaceModel(orders, []);
  const quoteItems = [...model.attentionItems, ...model.waitingItems].filter((item) =>
    item.to.startsWith("/admin/quotes?queue=")
  );

  quoteItems.forEach((item) => {
    const filterKey = new URL(`https://example.test${item.to}`).searchParams.get("queue");
    const destinationCount = orders.filter((order) =>
      matchesQuoteQueueFilter(order, buildQuoteSummary(order), filterKey)
    ).length;
    expect(destinationCount, item.label).toBe(item.count);
  });
});

test("staff-ready counts match production destinations and dashboard hierarchy stays intact", async () => {
  const orders = [
    { order_number: "PROD-1", operational_visible: true, status: "Ready For Production" },
    { order_number: "PROD-2", operational_visible: true, status: "Printing" },
    { order_number: "PICKUP-1", operational_visible: true, status: "Ready For Pickup" },
    quote({
      order_number: "QUOTE-READY",
      quote_status: "Awaiting Deposit",
      approval_status: "Approved",
      artwork_approval_required: false,
      deposit_required: false,
      total_amount: 100,
    }),
  ];
  const model = buildOwnerWorkspaceModel(orders, []);
  const readyByKey = Object.fromEntries(model.readyItems.map((item) => [item.key, item]));

  expect(readyByKey["ready-for-production"]).toMatchObject({
    count: 1,
    to: "/admin/orders?status=ready-for-production",
  });
  expect(readyByKey["ready-for-pickup"]).toMatchObject({
    count: 1,
    to: "/admin/orders?status=ready-for-pickup",
  });

  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/Dashboard.jsx", import.meta.url), "utf8")
  );
  const attention = source.indexOf('title="Actionable work"');
  const waiting = source.indexOf('title="Blocked until the customer responds"');
  const ready = source.indexOf('title="Work the team can start"');
  const changed = source.indexOf('title="What changed"');
  const overview = source.indexOf('title="Business overview"');

  expect(waiting).toBeGreaterThan(attention);
  expect(ready).toBeGreaterThan(waiting);
  expect(changed).toBeGreaterThan(ready);
  expect(overview).toBeGreaterThan(changed);
});

test("dashboard and production wait for authoritative order hydration before rendering queues", async () => {
  const fs = await import("node:fs/promises");
  const dashboardSource = await fs.readFile(
    new URL("../src/admin/Dashboard.jsx", import.meta.url),
    "utf8"
  );
  const productionSource = await fs.readFile(
    new URL("../src/admin/Orders.jsx", import.meta.url),
    "utf8"
  );

  expect(dashboardSource).toContain("useStoredOrdersHydrationState");
  expect(dashboardSource).toContain('ordersHydration.status !== "ready"');
  expect(dashboardSource.indexOf('ordersHydration.status !== "ready"')).toBeLessThan(
    dashboardSource.indexOf("<OwnerDashboard")
  );
  expect(productionSource).toContain("useStoredOrdersHydrationState");
  expect(productionSource).toContain('ordersHydration.status !== "ready"');
  expect(productionSource.indexOf('ordersHydration.status !== "ready"')).toBeLessThan(
    productionSource.lastIndexOf("return (")
  );
});

test("owner dashboard renders Teresa's morning briefing with trusted shortcuts", async ({ page }) => {
  const config = getOperationalConfig();
  await page.goto("/login?redirectTo=/admin");
  await loginThroughOperationalPin(page, config, "/admin");

  await expect(page.getByRole("heading", { name: "Actionable work" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Blocked until the customer responds" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work the team can start" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();
  await expect(page.getByText(/\d+ owner actions?/)).toBeVisible();

  await expect(page.getByRole("link").filter({ hasText: "New Order Requests" })).toHaveAttribute(
    "href",
    "/admin/quotes?queue=new"
  );
  await expect(page.getByRole("link").filter({ hasText: "Waiting for Customer Artwork" })).toHaveAttribute(
    "href",
    "/admin/quotes?queue=customer-artwork"
  );
  await expect(page.getByRole("link").filter({ hasText: "Ready for Production" })).toHaveAttribute(
    "href",
    "/admin/orders?status=ready-for-production"
  );
});
