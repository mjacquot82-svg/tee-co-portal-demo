// @ts-check
import { expect, test } from "@playwright/test";
import {
  PUBLIC_GARMENT_FLOW_SOURCE,
  shouldRedirectRequestOrderToStorefront,
} from "../src/customer-portal/customerPortalStartOrderRoute.js";

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
