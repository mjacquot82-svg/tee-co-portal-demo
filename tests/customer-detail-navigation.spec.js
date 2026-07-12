// @ts-check
import { expect, test } from "@playwright/test";

const customer = {
  id: "customer-nav-polish",
  name: "Navigation Polish Customer",
  company: "Tee Navigation Co",
  phone: "555-0100",
  email: "navigation@example.com",
  notes: "Customer detail navigation regression record.",
  created_at: "2026-07-10T12:00:00.000Z",
  updated_at: "2026-07-10T12:00:00.000Z",
};

const ownerUser = {
  id: "staff-owner-default",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

async function installCustomerNavigationState(page) {
  await page.addInitScript(({ seededCustomer, seededOwner }) => {
    window.localStorage.setItem(
      "teeCoStaffUsers",
      JSON.stringify([
        {
          ...seededOwner,
          pin: "1234",
          status: "Active",
          created_at: "2026-07-10T12:00:00.000Z",
          updated_at: "2026-07-10T12:00:00.000Z",
        },
      ])
    );
    window.sessionStorage.setItem("teeCoActiveStaffUser", JSON.stringify(seededOwner));
    window.localStorage.setItem("teeCoCustomers", JSON.stringify([seededCustomer]));
    window.localStorage.setItem("teeCoOrders", JSON.stringify([]));
    window.localStorage.setItem("teeCoSales", JSON.stringify([]));
  }, { seededCustomer: customer, seededOwner: ownerUser });
}

async function expectWorkspaceReady(page) {
  await expect(page.getByRole("status", { name: "Loading Tee & Co Central Operations" })).toBeHidden();
}

async function expectCustomersList(page) {
  await expect(page).toHaveURL(/\/admin\/customers$/);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByTestId("customer-records-list")).toBeVisible();
  await expect(page.getByRole("link", { name: /Navigation Polish Customer/ })).toBeVisible();
  await expectWorkspaceReady(page);
}

async function openCustomerDetailFromList(page) {
  await page.goto("/admin/customers");
  await expectCustomersList(page);
  await page.getByRole("link", { name: /Navigation Polish Customer/ }).click();
  await expect(page).toHaveURL(/\/admin\/customers\/customer-nav-polish$/);
  await expect(page.getByRole("heading", { name: "Navigation Polish Customer" })).toBeVisible();
  await expectWorkspaceReady(page);
}

test.beforeEach(async ({ page }) => {
  await installCustomerNavigationState(page);
});

test("top Back to Customers link returns from customer detail to the customer list", async ({ page }) => {
  await openCustomerDetailFromList(page);

  await page.getByRole("link", { name: "← Back to Customers" }).click();

  await expectCustomersList(page);
});

test("left navigation Customers link returns from customer detail to the customer list", async ({ page }) => {
  await openCustomerDetailFromList(page);

  await page.locator("aside").getByRole("link", { name: /Customers/ }).click();

  await expectCustomersList(page);
});

test("browser Back returns from customer detail to the customer list", async ({ page }) => {
  await openCustomerDetailFromList(page);

  await page.goBack();

  await expectCustomersList(page);
});
