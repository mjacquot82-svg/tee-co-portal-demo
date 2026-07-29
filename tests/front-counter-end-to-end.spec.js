// @ts-check
import { expect, test } from "@playwright/test";

const owner = {
  id: "staff-owner-default",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

function buildReadyOrder({
  orderNumber,
  customerId,
  customerName,
  total,
  paid,
}) {
  return {
    id: orderNumber,
    order_number: orderNumber,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: "555-0199",
    customer_email: `${customerId}@example.test`,
    status: "Ready For Pickup",
    quote_status: "Ready For Production",
    operational_visible: true,
    production_ready: true,
    pickup_status: "Ready for Pickup",
    front_counter_status:
      paid >= total ? "Ready For Customer Pickup" : "Awaiting Remaining Payment",
    front_counter_released_at: "2026-07-29T10:00:00.000Z",
    front_counter_released_by_staff_id: "production-staff-acceptance",
    front_counter_released_by_staff_name: "Production Acceptance",
    artwork_approval_required: true,
    artwork_approval_status: "Approved",
    artwork_files: [{ id: `${orderNumber}-art`, name: "acceptance-logo.png" }],
    deposit_required: paid > 0,
    deposit_amount: paid,
    deposit_paid_amount: paid,
    deposit_workflow_status: paid > 0 ? "Deposit Received" : "Not Required",
    total_amount: total,
    total,
    subtotal: total,
    total_paid: paid,
    amount_paid: paid,
    paid_to_date: paid,
    balance_due: total - paid,
    payment_status: paid >= total ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid",
    invoice_status: paid >= total ? "Paid" : "Open",
    payment_collection_state: paid >= total ? "Paid" : "Awaiting Final Payment",
    payment_history:
      paid > 0
        ? [
            {
              id: `${orderNumber}-deposit-payment`,
              amount: paid,
              method: "Cash",
              note: "Partial deposit paid during acceptance setup.",
              timestamp: "2026-07-29T09:15:00.000Z",
            },
          ]
        : [],
    line_items: [
      {
        name: "Decorated Acceptance Tee",
        decoration_type: "Screen Print",
        artwork_id: `${orderNumber}-art`,
        qty: 12,
        unit_price: total / 12,
      },
    ],
    garment: "Decorated Acceptance Tee",
    qty: 12,
    created_at: "2026-07-29T09:00:00.000Z",
    updated_at: "2026-07-29T09:00:00.000Z",
  };
}

async function installScenario(page, order) {
  await page.addInitScript(
    ({ activeOwner, seededOrder }) => {
      if (window.sessionStorage.getItem("frontCounterAcceptanceSeeded") === seededOrder.order_number) {
        return;
      }
      window.sessionStorage.setItem("frontCounterAcceptanceSeeded", seededOrder.order_number);
      window.sessionStorage.setItem("teeCoActiveStaffUser", JSON.stringify(activeOwner));
      window.localStorage.setItem(
        "teeCoStaffUsers",
        JSON.stringify([
          {
            ...activeOwner,
            pin: "1234",
            status: "Active",
            created_at: "2026-07-29T08:00:00.000Z",
            updated_at: "2026-07-29T08:00:00.000Z",
          },
        ])
      );
      window.localStorage.setItem(
        "teeCoCustomers",
        JSON.stringify([
          {
            id: seededOrder.customer_id,
            name: seededOrder.customer_name,
            phone: seededOrder.customer_phone,
            email: seededOrder.customer_email,
            order_numbers: [seededOrder.order_number],
          },
        ])
      );
      window.localStorage.setItem(
        "teeCoStaffOrders",
        JSON.stringify({
          schemaVersion: 2,
          scope: `development:${window.location.origin}:staff:${activeOwner.id}`,
          serverConfirmed: false,
          orders: [seededOrder],
        })
      );
      window.localStorage.setItem("teeCoQuickSales", JSON.stringify([]));
    },
    { activeOwner: owner, seededOrder: order }
  );
}

async function selectCustomer(page, customerName) {
  const search = page.getByPlaceholder("Search name, phone, email, company, or order #");
  await search.fill(customerName);
  await page.getByRole("button", { name: new RegExp(customerName) }).first().click();
}

async function completePickup(page, orderNumber) {
  await expect(page.getByRole("heading", { name: "Released Orders" })).toBeVisible();
  const orderCard = page.locator(
    `[data-testid="front-counter-order-card"][data-order-number="${orderNumber}"]`
  );
  await expect(orderCard).toBeVisible();
  if (await orderCard.getByRole("button", { name: "Continue", exact: true }).count()) {
    await orderCard.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Confirm Order Handed to Customer" }).click();
  await expect(page.getByText("Pickup released for 1 selected order.")).toBeVisible();
  await expect(page.getByText("Order completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Next Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Order" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Receipt" })).toBeVisible();
}

test("Scenario A: fully paid decorated order releases only to Customer Pickup and completes", async ({
  page,
}) => {
  const order = buildReadyOrder({
    orderNumber: "FC-A-PAID",
    customerId: "fc-customer-a",
    customerName: "Front Counter Paid",
    total: 120,
    paid: 120,
  });
  await installScenario(page, order);

  await page.goto("/admin/sales/new");
  await selectCustomer(page, order.customer_name);
  await expect(page.getByText("Ready for Pickup", { exact: true })).toBeVisible();

  await completePickup(page, order.order_number);
  await expect(
    page.locator(
      `[data-testid="front-counter-order-card"][data-order-number="${order.order_number}"]`
    )
  ).toHaveCount(0);

  await page.goto("/admin/sales");
  await expect(page.getByRole("heading", { name: "Sales History" })).toBeVisible();
  await expect(page.getByText(`SALE-${order.order_number}`)).toBeVisible();
});

test("Scenario B: remaining balance is collected before Customer Pickup and completion", async ({
  page,
}) => {
  const order = buildReadyOrder({
    orderNumber: "FC-B-BALANCE",
    customerId: "fc-customer-b",
    customerName: "Front Counter Balance",
    total: 200,
    paid: 80,
  });
  await installScenario(page, order);

  await page.goto("/admin/sales/new");
  await selectCustomer(page, order.customer_name);
  const paymentCard = page.locator(
    `[data-testid="front-counter-order-card"][data-order-number="${order.order_number}"]`
  );
  await expect(paymentCard).toContainText("$120.00");
  await expect(paymentCard).toContainText("Payment Required");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  const amountInput = page.getByLabel("Amount");
  await amountInput.fill("121");
  await expect(page.getByRole("button", { name: "Record Cash" })).toBeDisabled();
  await expect(page.getByText("Payment exceeds remaining balance.")).toBeVisible();
  await amountInput.fill("120");
  await expect(page.getByRole("button", { name: "Record Cash" })).toBeEnabled();
  await page.getByRole("button", { name: "Record Cash" }).click();
  await expect(page.getByText(/now ready to release/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Order Handed to Customer" })
  ).toBeVisible();

  await completePickup(page, order.order_number);
  await page.goto("/admin/sales");
  await expect(page.getByText(`SALE-${order.order_number}`)).toBeVisible();
});
