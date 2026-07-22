// @ts-check
import { expect, test } from "@playwright/test";
import { matchesProductionEmployee } from "../src/production/productionEmployeeFilter.js";

const staff = [
  { id: "teresa", name: "Teresa", status: "Active" },
  { id: "grace", name: "Grace", status: "Active" },
];

test("production employee filtering supports all, unassigned, ids, and legacy names", () => {
  const unassigned = { order_number: "A", assigned_to_staff_id: "", assigned_to_staff_name: "" };
  const assigned = { order_number: "B", assigned_to_staff_id: "grace", assigned_to_staff_name: "Grace" };
  const legacyAssigned = { order_number: "C", assigned_to_staff_id: "", assigned_to_staff_name: "Teresa" };

  expect(matchesProductionEmployee(unassigned, "all", staff)).toBe(true);
  expect(matchesProductionEmployee(unassigned, "unassigned", staff)).toBe(true);
  expect(matchesProductionEmployee(assigned, "unassigned", staff)).toBe(false);
  expect(matchesProductionEmployee(assigned, "grace", staff)).toBe(true);
  expect(matchesProductionEmployee(assigned, "teresa", staff)).toBe(false);
  expect(matchesProductionEmployee(legacyAssigned, "teresa", staff)).toBe(true);
});

test("Production owns assignment navigation and the compatibility route redirects", async () => {
  const [appSource, layoutSource, ordersSource] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/App.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/components/Layout.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/Orders.jsx", import.meta.url), "utf8")),
  ]);

  expect(appSource).toContain('<Navigate to="/admin/orders?employee=unassigned" replace />');
  expect(appSource).not.toContain('import Assignments from "./admin/Assignments"');
  expect(layoutSource).not.toContain('label: "Assign Work"');
  expect(ordersSource).toContain('data-testid="production-employee-filter"');
  expect(ordersSource).not.toContain('to="/admin/assignments"');
});

test("assignment dashboard links open filtered Production", async () => {
  const sources = await Promise.all([
    "../src/admin/AssignmentsDashboardCard.jsx",
    "../src/dashboard/DashboardAssignmentsPanel.jsx",
    "../src/dashboard/assignmentAlertSection.js",
  ].map((path) => import("node:fs/promises").then((fs) => fs.readFile(new URL(path, import.meta.url), "utf8"))));

  sources.forEach((source) => expect(source).toContain("/admin/orders?employee=unassigned"));
  sources.forEach((source) => expect(source).not.toContain("/admin/assignments"));
});

test("the Production Queue keeps only daily controls visible by default", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/Orders.jsx", import.meta.url), "utf8"));
  const dailyFilters = source.slice(source.indexOf("const DAILY_STATUS_FILTERS"), source.indexOf("const ATTENTION_FILTERS"));

  ["All Active", "Ready to Start", "In Production", "QC / Finishing", "Ready for Pickup"].forEach((label) => {
    expect(dailyFilters).toContain(label);
  });
  ["Today", "Completed", "Canceled", "DTF", "Embroidery", "Screen Print"].forEach((label) => {
    expect(dailyFilters).not.toContain(label);
  });
  expect(source).toContain("Advanced Filters");
  expect(source).toContain("PRODUCTION_METHOD_FILTERS.map");
  expect(source).toContain("PRODUCTION_DATE_FILTERS.map");
  expect(source).not.toContain("SECONDARY_VISIBLE_STATUS_FILTERS");
});
