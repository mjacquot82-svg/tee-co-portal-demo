// @ts-check
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  getOrderingWorkflowPaths,
  isPortalOrderingPath,
  isPortalOrderingWorkflowPath,
  PORTAL_ORDER_CATALOG_PATH,
  PORTAL_ORDER_SUBMITTED_PATH,
  PUBLIC_GARMENT_FLOW_SOURCE,
  shouldOfferPendingDraftRecovery,
} from "../src/customer-portal/customerPortalStartOrderRoute.js";

test("customer order confirmation remains inside the authenticated portal", () => {
  expect(PORTAL_ORDER_SUBMITTED_PATH).toBe("/portal/order-submitted");
});

test("successful submission does not trigger the empty-request storefront redirect", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );
  const confirmationStart = source.indexOf("navigate(PORTAL_ORDER_SUBMITTED_PATH");
  const cleanupStart = source.lastIndexOf("if (pendingRequest) {", confirmationStart);
  const successfulSubmissionCleanup = source.slice(cleanupStart, confirmationStart);

  expect(successfulSubmissionCleanup).toContain("clearPendingCustomerRequest()");
  expect(successfulSubmissionCleanup).not.toContain("setPendingRequest(null)");
});

test("fresh portal orders start in the authenticated ordering catalog", () => {
  expect(PORTAL_ORDER_CATALOG_PATH).toBe("/portal/order");
  expect(isPortalOrderingPath("/portal/order")).toBe(true);
  expect(isPortalOrderingPath("/portal/order/garment/product-1")).toBe(true);
  expect(isPortalOrderingPath("/portal/orderly")).toBe(false);
  expect(isPortalOrderingPath("/order-preview")).toBe(false);
  expect(isPortalOrderingWorkflowPath("/portal/order")).toBe(true);
  expect(isPortalOrderingWorkflowPath("/portal/request-order")).toBe(true);
  expect(isPortalOrderingWorkflowPath("/portal/order-submitted")).toBe(true);
  expect(isPortalOrderingWorkflowPath("/portal/orders")).toBe(false);
});

test("ordering links stay in the portal when the workflow started there", () => {
  const portalPaths = getOrderingWorkflowPaths("/portal/order/category/hoodies");
  expect(portalPaths.catalog).toBe("/portal/order");
  expect(portalPaths.category("tees")).toBe("/portal/order/category/tees");
  expect(portalPaths.garment("product-1")).toBe("/portal/order/garment/product-1");
  expect(portalPaths.preview).toBe("/portal/order/order-preview");

  const publicPaths = getOrderingWorkflowPaths("/");
  expect(publicPaths.catalog).toBe("/");
  expect(publicPaths.garment("product-1")).toBe("/garment/product-1");
  expect(publicPaths.preview).toBe("/order-preview");
});

test("portal ordering routes are nested under the authenticated shell", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/App.jsx"), "utf8");
  const portalRouteStart = source.indexOf('<Route path="/portal"');
  const portalRoutes = source.slice(portalRouteStart);

  expect(portalRoutes).toContain('<Route path="order" element={<Home />} />');
  expect(portalRoutes).toContain('<Route path="order/category/:categoryId" element={<CategoryView />} />');
  expect(portalRoutes).toContain('<Route path="order/garment/:garmentId" element={<GarmentView />} />');
  expect(portalRoutes).toContain('<Route path="order/order-preview" element={<OrderPreview />} />');
});

test("Start New Order keeps portal navigation visible and Back returns to the prior portal page", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify({
        id: "portal-order-routing-customer",
        displayName: "Portal Routing Customer",
        email: "portal-routing@example.com",
        authMode: "demo-session",
      })
    );
  });

  await page.goto("/portal/orders");
  await page.getByRole("link", { name: "Start New Order" }).first().click();

  await expect(page).toHaveURL(/\/portal\/order$/);
  await expect(page.getByText("Customer Portal", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Orders" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quotes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/portal\/orders$/);
});

test("portal ordering uses a wide dashboard canvas and keeps account navigation visible", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify({
        id: "portal-layout-customer",
        displayName: "Portal Layout Customer",
        email: "portal-layout@example.com",
        authMode: "demo-session",
      })
    );
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/portal/order");

  const sidebar = page.locator(".customer-portal-sidebar");
  const orderingContent = page.locator(".customer-portal-ordering");
  const backToAccount = page.getByRole("link", { name: "Back to Account" });
  await expect(sidebar).toBeVisible();
  await expect(orderingContent).toBeVisible();
  await expect(backToAccount).toBeVisible();

  const desktopLayout = await page.locator(".customer-portal-layout").evaluate((element) => {
    const sidebarElement = element.querySelector(".customer-portal-sidebar");
    const contentElement = element.querySelector(".customer-portal-ordering");
    return {
      layoutWidth: element.getBoundingClientRect().width,
      sidebarWidth: sidebarElement?.getBoundingClientRect().width || 0,
      contentWidth: contentElement?.getBoundingClientRect().width || 0,
      columns: getComputedStyle(element).gridTemplateColumns,
    };
  });

  expect(desktopLayout.layoutWidth).toBeGreaterThan(1450);
  expect(desktopLayout.sidebarWidth).toBeGreaterThan(200);
  expect(desktopLayout.contentWidth).toBeGreaterThan(1150);
  expect(desktopLayout.columns.split(" ")).toHaveLength(2);

  await page.setViewportSize({ width: 800, height: 1000 });
  const mobileLayout = await page.locator(".customer-portal-layout").evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns,
    width: element.getBoundingClientRect().width,
  }));

  await expect(sidebar).toBeVisible();
  await expect(backToAccount).toBeVisible();
  expect(mobileLayout.columns.split(" ")).toHaveLength(1);
  expect(mobileLayout.width).toBeGreaterThan(700);
});

test("Back to Account returns to the dashboard without clearing an in-progress order", async ({ page }) => {
  const draft = {
    productId: "product-1",
    garmentName: "Logo Hoodie",
    lineItems: [{ id: "line-1", quantity: 12 }],
  };

  await page.addInitScript((pendingDraft) => {
    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify({
        id: "portal-order-return-customer",
        displayName: "Portal Return Customer",
        email: "portal-return@example.com",
        authMode: "demo-session",
      })
    );
    window.localStorage.setItem("teeCoPendingCustomerRequest", JSON.stringify(pendingDraft));
  }, draft);

  await page.goto("/portal/order/garment/product-1");
  await page.getByRole("link", { name: "Back to Account" }).click();

  await expect(page).toHaveURL(/\/portal\/orders$/);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("teeCoPendingCustomerRequest")))
    .not.toBeNull();
});

test("stored drafts require a customer decision except during the immediate preview handoff", () => {
  const pendingRequest = {
    productId: "product-1",
    garmentName: "Logo Hoodie",
  };

  expect(shouldOfferPendingDraftRecovery({ pendingRequest })).toBe(true);
  expect(
    shouldOfferPendingDraftRecovery({
      pendingRequest,
      pendingRequestSource: PUBLIC_GARMENT_FLOW_SOURCE,
    })
  ).toBe(false);
  expect(shouldOfferPendingDraftRecovery()).toBe(false);
});

test("draft recovery presents explicit resume, discard, and fresh-start actions", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );

  expect(source).toContain("You have an unfinished order");
  expect(source).toContain("Resume Draft");
  expect(source).toContain("Discard Draft");
  expect(source).toContain("Start New Order");
  expect(source).toContain("await clearPendingCustomerArtwork()");
  expect(source).toContain("clearPendingCustomerRequest()");
});
