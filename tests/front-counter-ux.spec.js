// @ts-check
import { expect, test } from "@playwright/test";

const ownerUser = {
  id: "staff-owner-default",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

async function installFrontCounterSession(page, user = ownerUser) {
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
  }, { owner: user });
}

async function installPickupCustomers(page, { customers, orders }) {
  await page.addInitScript(
    ({ seededCustomers, seededOrders, owner }) => {
      window.sessionStorage.setItem("teeCoActiveStaffUser", JSON.stringify(owner));
      window.localStorage.setItem("teeCoCustomers", JSON.stringify(seededCustomers));
      window.localStorage.setItem(
        "teeCoStaffOrders",
        JSON.stringify({
          schemaVersion: 2,
          scope: `development:${window.location.origin}:staff:${owner.id}`,
          serverConfirmed: false,
          orders: seededOrders,
        })
      );
    },
    { seededCustomers: customers, seededOrders: orders, owner: ownerUser }
  );
}

function releasedOrder(orderNumber, customerId, customerName, balanceDue = 0) {
  return {
    id: orderNumber,
    order_number: orderNumber,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: "519-881-6869",
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    front_counter_status:
      balanceDue > 0 ? "Awaiting Remaining Payment" : "Ready For Customer Pickup",
    front_counter_released_at: "2026-07-29T10:00:00.000Z",
    balance_due: balanceDue,
    total_amount: 100,
    total_paid: 100 - balanceDue,
    paid_to_date: 100 - balanceDue,
    payment_status: balanceDue > 0 ? "Partially Paid" : "Paid",
    invoice_status: balanceDue > 0 ? "Open" : "Paid",
    garment: "Acceptance Tee",
    qty: 12,
  };
}

test("front counter uses unified customer pickup and a separate stateful walk-in workspace", async ({ page }) => {
  await installFrontCounterSession(page);
  await page.goto("/admin/sales/new");

  await expect(page.getByRole("heading", { name: "Current transaction" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customer Pickup/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Walk-In Sale/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Collect Payment/ })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Who is picking up today?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Released Orders" })).toHaveCount(0);
  await expect(page.getByTestId("pickup-action-panel")).toHaveCount(0);

  await page.getByRole("button", { name: /Walk-In Sale/ }).click();
  await expect(page.getByRole("heading", { name: "Search Product" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByLabel("Customer Name")).toBeVisible();
  await expect(page.getByText("Payment", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Complete Sale/ })).toBeVisible();

  await page.getByPlaceholder("Search product, SKU, brand, or category").fill("tee");
  await expect(page.getByTestId("pos-product-result").first()).toBeVisible();
  await expect(page.getByTestId("pos-product-results")).toHaveCSS("overflow-y", "visible");
  await page.getByTestId("pos-product-result").first().dispatchEvent("click");
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toHaveCount(0);
  await expect(page.getByTestId("pos-product-result")).toHaveCount(0);
  await expect(page.getByText("Selected Product")).toBeVisible();
  if (await page.getByTestId("pos-color-option").count()) {
    await page.getByTestId("pos-color-option").first().dispatchEvent("click");
  }
  if (await page.getByTestId("pos-size-option").count()) {
    await page.getByTestId("pos-size-option").first().dispatchEvent("click");
  }
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
  await expect(page.getByRole("heading", { name: "Product Search" })).toBeVisible();
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toHaveValue("tee");
  await expect(page.getByTestId("pos-product-result").first()).toBeVisible();
  for (const method of ["Cash", "Debit", "Credit", "E-Transfer", "Cheque"]) {
    await expect(page.getByRole("button", { name: method, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Other", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pay Later", exact: true })).toHaveCount(0);
  const viewportFit = await page.evaluate(() => {
    const completeButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Complete Sale")
    );
    return {
      pageHasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight + 1,
      completeActionInViewport: Boolean(
        completeButton && completeButton.getBoundingClientRect().bottom <= window.innerHeight
      ),
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      completeBottom: completeButton?.getBoundingClientRect().bottom || 0,
      workflowBottom: document.querySelector("#quick-sale-workflow")?.getBoundingClientRect().bottom || 0,
      transactionRailBottom: completeButton?.closest("aside")?.getBoundingClientRect().bottom || 0,
    };
  });
  expect(viewportFit.pageHasVerticalScroll, JSON.stringify(viewportFit)).toBe(false);
  expect(viewportFit.completeActionInViewport, JSON.stringify(viewportFit)).toBe(true);
});

test("customer pickup progressively reveals orders and the selected action", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const customer = {
    id: "pickup-customer",
    name: "Marc Jacquot",
    phone: "519-881-6869",
    email: "marc@example.test",
    order_numbers: ["PICKUP-PAID", "PICKUP-DUE"],
  };
  await installFrontCounterSession(page);
  await installPickupCustomers(page, {
    customers: [customer, { id: "zero-customer", name: "No Pickup Customer", phone: "519-555-0100" }],
    orders: [
      releasedOrder("PICKUP-PAID", customer.id, customer.name, 0),
      releasedOrder("PICKUP-DUE", customer.id, customer.name, 1),
    ],
  });
  await page.route("**/rest/v1/**", (route) => route.abort());
  await page.goto("/admin/sales/new");

  const search = page.getByPlaceholder("Search name, phone, email, company, or order #");
  await search.fill(customer.name);
  await page.getByRole("button", { name: /Marc Jacquot/ }).click();

  await expect(page.getByTestId("pickup-customer-search")).toHaveCount(0);
  await expect(page.getByTestId("pickup-customer-header")).toContainText("2 Released Orders");
  await expect(page.getByTestId("pickup-customer-header")).toContainText("$1.00 Remaining Today");
  await expect(page.getByText(/linked order/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Released Orders" })).toBeVisible();
  await expect(page.getByTestId("front-counter-order-card")).toHaveCount(2);
  await expect(page.getByTestId("pickup-action-panel")).toHaveCount(0);

  await page
    .locator('[data-testid="front-counter-order-card"][data-order-number="PICKUP-DUE"]')
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByRole("heading", { name: "Collect $1.00 Payment" })).toBeVisible();
  const desktopColumns = await page
    .locator('.front-counter-workspace-grid[data-stage="action"]')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(desktopColumns.split(" ")).toHaveLength(2);

  await page.setViewportSize({ width: 1000, height: 900 });
  const tabletColumns = await page
    .locator('.front-counter-workspace-grid[data-stage="action"]')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(tabletColumns.split(" ")).toHaveLength(1);

  await page.getByRole("button", { name: "Back to Released Orders" }).click();
  await expect(page.getByTestId("pickup-action-panel")).toHaveCount(0);
  await expect(page.getByTestId("front-counter-order-card")).toHaveCount(2);

  await page
    .locator('[data-testid="front-counter-order-card"][data-order-number="PICKUP-PAID"]')
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByRole("heading", { name: "Confirm Customer Handoff" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Order Handed to Customer" }).click();
  await expect(page.getByRole("heading", { name: "Order Completed" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Return to Released Orders" })).toBeVisible();
  await page.getByRole("button", { name: "Return to Released Orders" }).click();
  await expect(page.getByTestId("front-counter-order-card")).toHaveCount(1);
  await expect(
    page.locator('[data-testid="front-counter-order-card"][data-order-number="PICKUP-DUE"]')
  ).toBeVisible();

  const [customerPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "View Customer" }).click(),
  ]);
  await expect(customerPage).toHaveURL(/\/admin\/customers\/pickup-customer/);
  await customerPage.close();
  await expect(page.getByTestId("pickup-customer-header")).toContainText("Marc Jacquot");

  await page.getByRole("button", { name: "Change Customer" }).click();
  await expect(page.getByRole("heading", { name: "Who is picking up today?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Released Orders" })).toHaveCount(0);
});

test("customer with zero released orders gets a focused empty state without an action panel", async ({ page }) => {
  const customer = { id: "zero-customer", name: "No Pickup Customer", phone: "519-555-0100" };
  await installFrontCounterSession(page);
  await installPickupCustomers(page, { customers: [customer], orders: [] });
  await page.goto("/admin/sales/new");
  await page.getByPlaceholder("Search name, phone, email, company, or order #").fill(customer.name);
  await page.getByRole("button", { name: /No Pickup Customer/ }).click();

  await expect(page.getByTestId("pickup-customer-header")).toContainText("0 Released Orders");
  await expect(page.getByText("No orders released to Front Counter are available for this customer.")).toBeVisible();
  await expect(page.getByTestId("pickup-action-panel")).toHaveCount(0);
});

test("Owner can complete a sale with an accepted payment method", async ({ page }) => {
    await installFrontCounterSession(page, ownerUser);
    await page.goto("/admin/sales/new");

    await page.getByRole("button", { name: /Walk-In Sale/ }).dispatchEvent("click");
    await page.getByPlaceholder("Search product, SKU, brand, or category").fill("classic");
    await page.getByTestId("pos-product-result").first().dispatchEvent("click");
    if (await page.getByTestId("pos-color-option").count()) {
      await page.getByTestId("pos-color-option").first().dispatchEvent("click");
    }
    if (await page.getByTestId("pos-size-option").count()) {
      await page.getByTestId("pos-size-option").first().dispatchEvent("click");
    }
    await page.getByRole("button", { name: "Add to Cart" }).click();

    await page.getByLabel("Customer Name").fill("Owner Customer");
    await page.getByLabel("Customer Phone").fill("555-0100");
    await page.getByRole("button", { name: "Cheque", exact: true }).click();
    await page.getByRole("button", { name: "Complete Sale" }).last().click();

    await expect(page.getByRole("heading", { name: "Quick Sale Completed" })).toBeVisible();
});
