// @ts-check
import { expect, test } from "@playwright/test";

const ownerUser = {
  id: "staff-owner-default",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

async function installFrontCounterSession(page) {
  await page.addInitScript(({ owner }) => {
    const products = [
      {
        id: "pos-classic-tee",
        name: "Classic Tee",
        category: "T-Shirts",
        brand_model: "Soft Cotton",
        status: "Active",
        colors: ["Black", "White", "Navy"],
        sizes: ["S", "M", "L", "XL"],
        retail_price: "24.99",
      },
      {
        id: "pos-pullover-hoodie",
        name: "Pullover Hoodie",
        category: "Hoodies",
        brand_model: "Fleece",
        status: "Active",
        colors: ["Black", "Grey"],
        sizes: ["M", "L", "XL"],
        retail_price: "54.99",
      },
    ];

    window.localStorage.setItem(
      "teeCoStaffUsers",
      JSON.stringify([
        {
          id: owner.id,
          name: owner.name,
          role: owner.role,
          pin: "1234",
          status: "Active",
          created_at: "2026-07-10T12:00:00.000Z",
          updated_at: "2026-07-10T12:00:00.000Z",
        },
      ])
    );
    window.sessionStorage.setItem("teeCoActiveStaffUser", JSON.stringify(owner));
    window.localStorage.setItem("teeCoCustomers", JSON.stringify([]));
    window.localStorage.setItem("teeCoOrders", JSON.stringify([]));
    window.localStorage.setItem("teeCoSales", JSON.stringify([]));
    window.localStorage.setItem("teeCoProducts", JSON.stringify(products));
  }, { owner: ownerUser });
}

test("front counter starts from action cards and transitions into each workflow", async ({ page }) => {
  await installFrontCounterSession(page);
  await page.goto("/admin/sales/new");

  await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Collect Payment/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customer Pickup/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Walk-In Sale/ })).toBeVisible();

  await page.getByRole("button", { name: /Customer Pickup/ }).click();
  await expect(page.getByText("Search Customer", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready Orders" })).toBeVisible();

  await page.getByRole("button", { name: /Collect Payment/ }).click();
  await expect(page.getByRole("heading", { name: "Outstanding Balances" })).toBeVisible();

  await page.getByRole("button", { name: /Walk-In Sale/ }).click();
  await expect(page.getByRole("heading", { name: "Search Product" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cart" })).toHaveCount(0);

  await page.getByPlaceholder("Search product, SKU, brand, or category").fill("tee");
  await expect(page.getByTestId("pos-product-result").first()).toBeVisible();
  await expect(page.getByTestId("pos-product-results")).toHaveCSS("overflow-y", "visible");
  await page.getByTestId("pos-product-result").first().click();
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toHaveCount(0);
  await expect(page.getByTestId("pos-product-result")).toHaveCount(0);
  await expect(page.getByText("Selected Product")).toBeVisible();
  await expect(page.getByText("Choose Colour")).toBeVisible();
  await expect(page.getByText("Choose Size")).toHaveCount(0);

  await page.getByTestId("pos-color-option").first().click();
  await expect(page.getByText("Choose Colour")).toHaveCount(0);
  await expect(page.getByText("Selected Colour")).toBeVisible();
  await expect(page.getByText("Choose Size")).toBeVisible();

  await page.getByTestId("pos-size-option").first().click();
  await expect(page.getByText("Choose Size")).toHaveCount(0);
  await expect(page.getByText("Selected Size")).toBeVisible();
  const quantityStepper = page.getByTestId("pos-line-quantity-stepper");
  const quantityInput = quantityStepper.getByRole("textbox", { name: "Quantity" });
  await expect(quantityInput).toBeVisible();
  await expect(quantityInput).toHaveValue("1");
  await quantityStepper.getByRole("button", { name: "Increase quantity" }).click();
  await expect(quantityInput).toHaveValue("2");
  await quantityStepper.getByRole("button", { name: "Decrease quantity" }).click();
  await quantityStepper.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(quantityInput).toHaveValue("1");
  await quantityInput.fill("3");
  await page.getByRole("button", { name: "Add to Cart" }).click();

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByTestId("pos-cart-quantity-stepper").getByRole("textbox", { name: "Qty" })).toHaveValue("3");
  await expect(page.getByRole("heading", { name: "Add Another Item" })).toBeVisible();
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toBeVisible();
  await expect(page.getByTestId("pos-product-result")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Payment" })).toHaveCount(0);
  await expect(page.getByTestId("pos-checkout-button")).toBeVisible();
  await page.getByTestId("pos-checkout-button").click();
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cash" })).toBeVisible();
});
