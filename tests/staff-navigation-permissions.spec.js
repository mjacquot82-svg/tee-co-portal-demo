// @ts-check
import { expect, test } from "@playwright/test";
import { canAccessOperationalWorkspace } from "../src/admin/adminRoleView.js";

const operationalUsers = {
  staff: { id: "staff-navigation-test", name: "Staff Navigation Test", role: "Staff" },
  owner: { id: "owner-navigation-test", name: "Owner Navigation Test", role: "Owner" },
  manager: { id: "manager-navigation-test", name: "Manager Navigation Test", role: "Manager" },
};

test("ordinary Staff navigation keeps daily execution workspaces and hides Order Requests", async () => {
  const layoutSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/components/Layout.jsx", import.meta.url), "utf8")
  );
  const staffNavigation = layoutSource.slice(
    layoutSource.indexOf("if (!isAdminWorkspaceView(staffUser))"),
    layoutSource.indexOf("const canAccessNavLink")
  );

  expect(staffNavigation).toContain('label: "My Assigned Work"');
  expect(staffNavigation).toContain('label: "Front Counter"');
  expect(staffNavigation).toContain('label: "Production"');
  expect(staffNavigation).toContain('label: "Notifications"');
  expect(staffNavigation).not.toContain('label: "Order Requests"');
});

test("Owner and Manager navigation retains Order Requests", async () => {
  const layoutSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/components/Layout.jsx", import.meta.url), "utf8")
  );
  const managementNavigation = layoutSource.slice(
    layoutSource.indexOf("const canAccessNavLink"),
    layoutSource.indexOf("function getActiveSidebarLink")
  );

  expect(managementNavigation).toContain('to: "/admin/quotes"');
  expect(managementNavigation).toContain('label: "Order Requests"');
  expect(canAccessOperationalWorkspace("/admin/quotes", operationalUsers.owner)).toBe(true);
  expect(canAccessOperationalWorkspace("/admin/quotes", operationalUsers.manager)).toBe(true);
});

test("hiding the Staff navigation entry does not change direct Order Requests route access", () => {
  expect(canAccessOperationalWorkspace("/admin/quotes", operationalUsers.staff)).toBe(true);
  expect(canAccessOperationalWorkspace("/admin/quotes/new", operationalUsers.staff)).toBe(true);
  expect(
    canAccessOperationalWorkspace("/admin/quotes/TC-DIRECT-ACCESS", operationalUsers.staff)
  ).toBe(true);
});

test("temporary order transition diagnostics are accessible only to an authenticated Owner", () => {
  expect(
    canAccessOperationalWorkspace(
      "/admin/order-transition-diagnostics",
      operationalUsers.owner
    )
  ).toBe(true);
  expect(
    canAccessOperationalWorkspace(
      "/admin/order-transition-diagnostics",
      operationalUsers.manager
    )
  ).toBe(false);
  expect(
    canAccessOperationalWorkspace(
      "/admin/order-transition-diagnostics",
      operationalUsers.staff
    )
  ).toBe(false);
});
