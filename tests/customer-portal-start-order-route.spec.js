// @ts-check
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  PORTAL_ORDER_SUBMITTED_PATH,
  PUBLIC_GARMENT_FLOW_SOURCE,
  shouldRedirectRequestOrderToStorefront,
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

test("portal request route sends fresh starts to the storefront", () => {
  expect(shouldRedirectRequestOrderToStorefront()).toBe(true);
  expect(
    shouldRedirectRequestOrderToStorefront({
      pendingRequest: null,
      pendingRequestSource: "",
    })
  ).toBe(true);
});

test("portal request route preserves order preview handoff", () => {
  expect(
    shouldRedirectRequestOrderToStorefront({
      pendingRequest: null,
      pendingRequestSource: PUBLIC_GARMENT_FLOW_SOURCE,
    })
  ).toBe(false);

  expect(
    shouldRedirectRequestOrderToStorefront({
      pendingRequest: {
        productId: "product-1",
        garmentName: "Logo Hoodie",
      },
      pendingRequestSource: "",
    })
  ).toBe(false);
});
