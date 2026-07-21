// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { getLineItemArtwork } from "../src/lib/orderArtwork.js";
import { getOrderLineItems } from "../src/lib/orderLineItems.js";

test("single-garment requests remain available through the canonical line item model", () => {
  const order = {
    garment: "Classic Tee",
    selected_color: "Black",
    size_breakdown: { M: 2 },
    decoration_type: "DTF",
    placement: "Left Chest",
    qty: 2,
    customer_artwork_id: "artwork-a",
    customer_artwork_name: "Company Logo",
    artwork_library: [{ id: "artwork-a", display_name: "Company Logo" }],
  };

  const [lineItem] = getOrderLineItems(order);
  expect(lineItem).toMatchObject({
    garment: "Classic Tee",
    selected_color: "Black",
    size_breakdown: { M: 2 },
    decoration_type: "DTF",
    placement: "Left Chest",
    quantity: 2,
    artwork_id: "artwork-a",
  });
  expect(getLineItemArtwork(order, lineItem)).toMatchObject({ id: "artwork-a", display_name: "Company Logo" });
});

test("multi-garment requests preserve independent sizes, decoration, placement, and artwork", () => {
  const order = {
    artwork_library: [
      { id: "artwork-a", display_name: "Company Logo" },
      { id: "artwork-b", display_name: "Large Back Logo" },
    ],
    line_items: [
      {
        id: "hoodie",
        garment: "Hoodie",
        selected_color: "Black",
        size_breakdown: { S: 1, M: 1, L: 1, XL: 1 },
        decoration_type: "DTF",
        placement: "Left Chest",
        artwork_id: "artwork-a",
        artwork_name: "Company Logo",
      },
      {
        id: "jacket",
        garment: "Jacket",
        selected_color: "Navy",
        size_breakdown: { L: 2 },
        decoration_type: "Screen Printing",
        placement: "Full Back",
        artwork_id: "artwork-b",
        artwork_name: "Large Back Logo",
      },
    ],
  };

  const lineItems = getOrderLineItems(order);
  expect(lineItems).toHaveLength(2);
  expect(lineItems[0]).toMatchObject({ garment: "Hoodie", size_breakdown: { S: 1, M: 1, L: 1, XL: 1 }, quantity: 4 });
  expect(lineItems[1]).toMatchObject({ garment: "Jacket", decoration_type: "Screen Printing", placement: "Full Back", quantity: 2 });
  expect(lineItems.map((item) => getLineItemArtwork(order, item)?.display_name)).toEqual(["Company Logo", "Large Back Logo"]);
});

test("Order Request Review renders Order Contents from canonical line items", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/admin/QuoteDetail.jsx"), "utf8");

  expect(source).toContain("const orderLineItems = getOrderLineItems(order)");
  expect(source).toContain('title="Order Contents"');
  expect(source).toContain('data-testid="intake-order-line-item"');
  expect(source).toContain("Object.entries(lineItem.size_breakdown || {})");
  expect(source).toContain("getLineItemArtwork(order, lineItem)");
  expect(source).not.toContain('title="What they want"');
});

test("Order Contents omits the legacy top-level artwork reference from customer notes", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/admin/QuoteDetail.jsx"), "utf8");

  expect(source).toContain("const customerNotes = getIntakeCustomerNotes(order)");
  expect(source).toContain("/^\\s*artwork reference\\s*:/i.test(line)");
  expect(source).toContain("{customerNotes}");
  expect(source).not.toContain("{order.customer_notes || order.request_details || order.notes}");
});
