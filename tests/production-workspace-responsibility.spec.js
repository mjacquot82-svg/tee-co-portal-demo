// @ts-check
import { expect, test } from "@playwright/test";
import { getOrderLineItems } from "../src/lib/orderLineItems.js";
import { getArtworkAssetUrl, getLineItemArtwork } from "../src/lib/orderArtwork.js";

test("production garment normalization preserves separate manufacturing instructions", () => {
  const items = getOrderLineItems({
    line_items: [
      { id: "shirt", garment: "T-Shirt", selected_color: "Black", size_breakdown: { M: 2 }, production_notes: "White underbase" },
      { id: "hoodie", garment: "Hoodie", selected_color: "Navy", size_breakdown: { L: 1 }, manufacturing_instructions: "Hoop carefully" },
    ],
  });

  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({ garment: "T-Shirt", selected_color: "Black", quantity: 2, production_notes: "White underbase" });
  expect(items[1]).toMatchObject({ garment: "Hoodie", selected_color: "Navy", quantity: 1, manufacturing_instructions: "Hoop carefully" });
});

test("production artwork resolves from each garment to its production file", () => {
  const order = {
    artwork_library: [
      { id: "front-logo", name: "Front Logo", asset_url: "https://example.test/front.png", type: "image/png" },
      { id: "sleeve-logo", name: "Sleeve Logo", asset_url: "https://example.test/sleeve.svg", type: "image/svg+xml" },
    ],
  };
  const front = getLineItemArtwork(order, { artwork_id: "front-logo" });
  const sleeve = getLineItemArtwork(order, { artwork_id: "sleeve-logo" });
  expect(getArtworkAssetUrl(front)).toBe("https://example.test/front.png");
  expect(getArtworkAssetUrl(sleeve)).toBe("https://example.test/sleeve.svg");
});

test("garment table surfaces urgent manufacturing notes without changing their content", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/GarmentProductionCards.jsx", import.meta.url), "utf8"));
  expect(source).toContain("/urgent|warning|caution|rush/i");
  expect(source).toContain('urgentNote ? "garment-production-warning"');
  expect(source).toContain('className="production-console-table"');
  expect(source).toContain('<th scope="col">Qty</th>');
  expect(source).toContain('<th scope="col">Artwork</th>');
  expect(source).toContain("<details");
});

test("order production notes surface warnings while historical workspaces remain secondary", async () => {
  const [notesSource, detailSource] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/ProductionInstructionsPanel.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")),
  ]);
  expect(notesSource).toContain('data-testid="production-notes-warning"');
  expect(notesSource).toContain("/urgent|warning|caution|rush/i");
  expect(detailSource).toContain('data-reference-role="secondary"');
});

test("the production route composes focused controls and garment cards", async () => {
  const [source, managementSource, consoleSource] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/OrderManagementWorkspace.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/ProductionWorkspaceConsole.jsx", import.meta.url), "utf8")),
  ]);
  expect(source).toContain("<ProductionActionPanel");
  expect(source).toContain("<AssignmentOnlyPanel");
  expect(source).toContain("<GarmentProductionCards order={order} />");
  expect(source).toContain("<ProductionWorkspaceConsole");
  expect(source).not.toContain("<AssignmentPanel");
  expect(source).toContain('data-testid="production-job-header"');
  expect(source).toContain("{assignmentPanel}");
  expect(consoleSource).toContain('className="production-console-pills"');
  expect(consoleSource).toContain('className="production-console-overview"');
  expect(consoleSource).toContain('label: "Order Review"');
  expect(consoleSource).toContain('label: "Artwork Review"');
  expect(consoleSource).toContain('label: "Deposit Decision"');
  expect(managementSource).toContain("Request Approval");
  expect(managementSource).toContain("Artwork Approval");
  expect(managementSource).toContain("Deposit Decision");
  expect(managementSource).toContain("collapsedByDefault");
});

test("the primary production workspace does not repeat lifecycle state", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/OrderDetail.jsx", import.meta.url), "utf8"));
  expect(source).not.toContain("<ProductionProgressTracker");
  expect(source).toContain('data-testid="order-detail-current-status"');
  expect(source).toContain("<ProcessCurrentActionPanel");
  expect(source).toContain("<ProductionActionPanel");
});

test("the workstation normalizes technique-specific start actions without changing action keys", async () => {
  const [actionSource, processActionSource] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/ProductionActionPanel.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/ProcessCurrentActionPanel.jsx", import.meta.url), "utf8")),
  ]);
  expect(actionSource).toContain('["start_printing", "start_embroidery"]');
  expect(actionSource).toContain('"Start Production"');
  expect(processActionSource).toContain('"Start Production"');
});

test("unassigned production work offers direct assignment decisions", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/AssignmentOnlyPanel.jsx", import.meta.url), "utf8"));
  expect(source).toContain('data-testid="assign-to-me-button"');
  expect(source).toContain("Assign Employee");
  expect(source).toContain("Claim Job");
  expect(source).not.toContain("Leave unassigned");
});
