// @ts-check
import { expect, test } from "@playwright/test";

const owner = {
  id: "application-shell-owner",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

async function installOperationalSession(page, user) {
  await page.addInitScript(({ operationalUser }) => {
    window.localStorage.setItem(
      "teeCoStaffUsers",
      JSON.stringify([
        {
          ...operationalUser,
          pin: "1234",
          status: "Active",
          created_at: "2026-07-25T12:00:00.000Z",
          updated_at: "2026-07-25T12:00:00.000Z",
        },
      ])
    );
    window.sessionStorage.setItem(
      "teeCoActiveStaffUser",
      JSON.stringify(operationalUser)
    );
    window.localStorage.setItem("teeCoOrders", JSON.stringify([]));
  }, { operationalUser: user });
}

test("Owner workspaces inherit the compact application shell", async ({ page }) => {
  await installOperationalSession(page, owner);
  await page.goto("/admin");

  const shell = page.getByTestId("admin-application-header");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveCSS("position", "sticky");
  await expect(shell).toContainText(owner.name);
  await expect(shell).toContainText(owner.role);
  await expect(page.getByRole("button", { name: "Lock Workstation" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What should Teresa work on right now?" })
  ).toBeVisible();

  const geometry = await shell.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const workspace = element.nextElementSibling;
    const workspaceBox = workspace?.getBoundingClientRect();
    return {
      height: box.height,
      workspaceGap: workspaceBox ? workspaceBox.top - box.bottom : null,
    };
  });

  expect(geometry.height).toBeLessThanOrEqual(46);
  expect(geometry.workspaceGap).toBe(0);
});

test("Owner and Staff routes share one shell composition point", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/components/Layout.jsx", import.meta.url), "utf8")
  );
  const adminComposition = source.slice(
    source.indexOf('<div style={{ display: "flex", alignItems: "flex-start" }}>'),
    source.indexOf("</AdminRenderBoundary>")
  );

  expect(adminComposition.match(/<AdminWorkspaceHeader/g)).toHaveLength(1);
  expect(adminComposition).toContain("staffUser={currentOperator}");
  expect(adminComposition).toContain("<Outlet />");
});

test("the application shell keeps session controls accessible at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await installOperationalSession(page, owner);
  await page.goto("/admin");

  const shell = page.getByTestId("admin-application-header");
  await expect(shell).toBeVisible();
  await page.getByRole("button", {
    name: `Account for ${owner.name}, ${owner.role}`,
  }).click();
  await expect(page.getByRole("menuitem", { name: "Lock Workstation" })).toBeVisible();

  const fit = await shell.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
});

test("the account menu opens from the complete identity control and closes outside or with Escape", async ({ page }) => {
  await installOperationalSession(page, owner);
  await page.goto("/admin");

  const accountTrigger = page.getByRole("button", {
    name: `Account for ${owner.name}, ${owner.role}`,
  });
  const accountMenu = page.getByRole("menu", { name: "Account" });

  await accountTrigger.click();
  await expect(accountTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu.getByRole("menuitem")).toHaveCount(2);

  await page.getByRole("heading", {
    name: "What should Teresa work on right now?",
  }).click();
  await expect(accountMenu).toHaveCount(0);

  await accountTrigger.click();
  await expect(accountMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountMenu).toHaveCount(0);
  await expect(accountTrigger).toBeFocused();
});

test("the account menu supports keyboard opening and menu-item navigation", async ({ page }) => {
  await installOperationalSession(page, owner);
  await page.goto("/admin");

  const accountTrigger = page.getByRole("button", {
    name: `Account for ${owner.name}, ${owner.role}`,
  });
  await accountTrigger.focus();
  await page.keyboard.press("ArrowDown");

  const lockItem = page.getByRole("menuitem", { name: "Lock Workstation" });
  const signOutItem = page.getByRole("menuitem", { name: "Sign Out" });
  await expect(lockItem).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(signOutItem).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(lockItem).toBeFocused();
});

for (const sessionAction of [
  { label: "account-menu Lock Workstation", buttonName: "Lock Workstation" },
  { label: "account-menu Sign Out", buttonName: "Sign Out" },
]) {
  test(`${sessionAction.label} preserves the existing session exit`, async ({ page }) => {
    await installOperationalSession(page, owner);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: "Lock Workstation" })).toHaveCount(0);
    await page.getByRole("button", {
      name: `Account for ${owner.name}, ${owner.role}`,
    }).click();
    await expect(page.getByRole("menuitem", { name: "Lock Workstation" })).toHaveCount(1);
    await page.getByRole("menuitem", { name: sessionAction.buttonName }).click();

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByTestId("admin-application-header")).toHaveCount(0);
  });
}
