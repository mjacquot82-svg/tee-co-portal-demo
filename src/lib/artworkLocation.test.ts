import { describe, expect, it } from "vitest";
import { normalizePendingCustomerRequest, upsertPendingCustomerLineItem } from "./pendingCustomerRequestStore";
import { normalizeOrderLineItem } from "./orderLineItems";
import { buildSupabaseOrderPayload, mapSupabaseOrderRowToOrder } from "./ordersRepository";

describe("artwork location handoff", () => {
  it.each(["Front", "Back", "Sleeve", "Hat front"])("preserves %s through draft edits and saved orders", (location) => {
    const initial = normalizePendingCustomerRequest({
      lineItems: [{ id: "shirt", productId: "product-1", artworkId: "logo", artworkLocation: location, quantity: 1 }],
    });
    const edited = upsertPendingCustomerLineItem(initial.lineItems, {
      ...initial.lineItems[0], quantity: 2,
    });
    const reloaded = normalizePendingCustomerRequest({ lineItems: edited });
    expect(reloaded.lineItems[0].artworkLocation).toBe(location);
    const submitted = normalizeOrderLineItem({ ...reloaded.lineItems[0], garment: "Shirt" });
    expect(submitted.artwork_location).toBe(location);
    const row = buildSupabaseOrderPayload({ order_number: "ARTWORK-LOCATION", line_items: [submitted] });
    expect(mapSupabaseOrderRowToOrder(row).line_items[0].artwork_location).toBe(location);
  });
});
