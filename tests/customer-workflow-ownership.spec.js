// @ts-check
import { test, expect } from "@playwright/test";

const OWNER_ORDER_NUMBER = "PW-AUTH-OWNER-1001";
const OWNER_CUSTOMER_ID = "customer-owner-auth";
const OWNER_EMAIL = "owner-auth@example.test";
const NON_OWNER_CUSTOMER_ID = "customer-non-owner-auth";
const NON_OWNER_EMAIL = "non-owner-auth@example.test";

const ownerSession = {
  id: "auth-owner-session",
  firstName: "Owner",
  lastName: "Customer",
  email: OWNER_EMAIL,
  phone: "555-1000",
  displayName: "Owner Customer",
  authMode: "playwright",
};

const nonOwnerSession = {
  id: "auth-non-owner-session",
  firstName: "Other",
  lastName: "Customer",
  email: NON_OWNER_EMAIL,
  phone: "555-2000",
  displayName: "Other Customer",
  authMode: "playwright",
};

const ownerCustomer = {
  id: OWNER_CUSTOMER_ID,
  customer_id: OWNER_CUSTOMER_ID,
  name: "Owner Customer",
  email: OWNER_EMAIL,
  phone: "555-1000",
  external_reference: ownerSession.id,
  auth_user_id: ownerSession.id,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const nonOwnerCustomer = {
  id: NON_OWNER_CUSTOMER_ID,
  customer_id: NON_OWNER_CUSTOMER_ID,
  name: "Other Customer",
  email: NON_OWNER_EMAIL,
  phone: "555-2000",
  external_reference: nonOwnerSession.id,
  auth_user_id: nonOwnerSession.id,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function buildOwnerOrder(overrides = {}) {
  return {
    id: OWNER_ORDER_NUMBER,
    order_number: OWNER_ORDER_NUMBER,
    customer_id: OWNER_CUSTOMER_ID,
    customer_name: "Owner Customer",
    customer_email: OWNER_EMAIL,
    garment: "Security Test Hoodie",
    quantity: 12,
    status: "Quote",
    quote_status: "Awaiting Approval",
    approval_status: "Pending",
    artwork_approval_status: "Awaiting Customer Approval",
    placement: "Left Chest",
    decoration_type: "Embroidery",
    deposit_required: true,
    deposit_amount: 125,
    deposit_applied: 0,
    balance_due: 375,
    deposit_workflow_status: "Awaiting Deposit",
    payment_status: "Awaiting Deposit",
    operational_visible: false,
    source: "Customer Portal",
    request_type: "Quote Request",
    request_completion_status: "pending_completion",
    artwork_intent: "",
    artwork_files: [
      {
        id: "mockup-owner",
        name: "Owner mockup.png",
        type: "image/png",
        preview:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
    ],
    placements: [
      {
        placement: "Left Chest",
        decoration_type: "Embroidery",
      },
    ],
    quote: {
      customer_name: "Owner Customer",
      garment: "Security Test Hoodie",
      quantity: 12,
      garment_unit_price: 20,
      garment_subtotal: 240,
      garment_pricing_available: true,
      placement_lines: [
        {
          placement: "Left Chest",
          decoration_type: "Embroidery",
          line_total: 135,
        },
      ],
      subtotal: 375,
      total: 375,
    },
    activity_log: [],
    customer_timeline: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function seedCustomerWorkflowData(page, { session = null, orderOverrides = {} } = {}) {
  await page.addInitScript(
    ({ activeSession, order, customers }) => {
      window.localStorage.setItem("teeCoStaffOrders", JSON.stringify([order]));
      window.localStorage.setItem("teeCoCustomers", JSON.stringify(customers));

      if (activeSession) {
        window.sessionStorage.setItem(
          "teeCoActiveCustomerSession",
          JSON.stringify(activeSession)
        );
      } else {
        window.sessionStorage.removeItem("teeCoActiveCustomerSession");
      }
    },
    {
      activeSession: session,
      order: buildOwnerOrder(orderOverrides),
      customers: [ownerCustomer, nonOwnerCustomer],
    }
  );
}

async function readSeededOrder(page) {
  return page.evaluate((orderNumber) => {
    const orders = JSON.parse(window.localStorage.getItem("teeCoStaffOrders") || "[]");
    return orders.find((order) => order.order_number === orderNumber) || null;
  }, OWNER_ORDER_NUMBER);
}

function protectedWorkflowRoutes() {
  return [
    {
      name: "artwork approval",
      path: `/approval/${OWNER_ORDER_NUMBER}`,
      expectedHeading: new RegExp(`Review Mockup for Order ${OWNER_ORDER_NUMBER}`, "i"),
      exposesOrderNumber: true,
      unavailableText: "This approval record is not available for this customer account.",
    },
    {
      name: "quote approval",
      path: `/quote/${OWNER_ORDER_NUMBER}`,
      expectedHeading: /Quote Preview/i,
      exposesOrderNumber: false,
      unavailableText: "This quote is not available for this customer account.",
    },
    {
      name: "deposit payment",
      path: `/deposit-payment?order=${encodeURIComponent(OWNER_ORDER_NUMBER)}`,
      expectedHeading: /Deposit Payment/i,
      exposesOrderNumber: true,
      unavailableText: "This deposit payment link is not available for this customer account.",
    },
    {
      name: "payment confirmation",
      path: `/payment-confirmed?order=${encodeURIComponent(OWNER_ORDER_NUMBER)}`,
      expectedHeading: /Payment Confirmed/i,
      exposesOrderNumber: true,
      unavailableText: "This payment confirmation is not available for this customer account.",
    },
    {
      name: "request completion",
      path: `/portal/requests/${OWNER_ORDER_NUMBER}/complete`,
      expectedHeading: new RegExp(`Complete request ${OWNER_ORDER_NUMBER}`, "i"),
      exposesOrderNumber: true,
      unavailableText: "The request could not be found in your customer portal.",
    },
  ];
}

test.describe("customer workflow route ownership", () => {
  for (const route of protectedWorkflowRoutes()) {
    test(`redirects unauthenticated customers from ${route.name} and preserves destination`, async ({
      page,
    }) => {
      await seedCustomerWorkflowData(page);

      await page.goto(route.path);

      await expect(page).toHaveURL((url) => {
        const redirectTo = url.searchParams.get("redirectTo");
        return url.pathname === "/login" && redirectTo === route.path;
      });
      await expect(page.getByRole("heading", { name: /Choose how you work today/i })).toBeVisible();
    });
  }

  for (const route of protectedWorkflowRoutes()) {
    test(`allows authenticated owner to access ${route.name}`, async ({ page }) => {
      await seedCustomerWorkflowData(page, { session: ownerSession });

      await page.goto(route.path);

      await expect(page.getByRole("heading", { name: route.expectedHeading })).toBeVisible();
      if (route.exposesOrderNumber) {
        await expect(page.locator("body")).toContainText(OWNER_ORDER_NUMBER);
      }
      await expect(page.locator("body")).toContainText("Owner Customer");
    });
  }

  for (const route of protectedWorkflowRoutes()) {
    test(`denies authenticated non-owner from ${route.name} without exposing order details`, async ({
      page,
    }) => {
      const consoleWarnings = [];
      page.on("console", (message) => {
        if (message.type() === "warning") {
          consoleWarnings.push(message.text());
        }
      });
      await seedCustomerWorkflowData(page, { session: nonOwnerSession });

      await page.goto(route.path);

      await expect(page.locator("body")).toContainText(route.unavailableText);
      await expect(page.locator("body")).not.toContainText("Security Test Hoodie");
      await expect(page.locator("body")).not.toContainText("Owner Customer");
      await expect(page.locator("body")).not.toContainText("Owner mockup.png");
      expect(consoleWarnings.some((warning) => warning.includes("ownership validation failed"))).toBe(
        true
      );
    });
  }

  test("returns customer to preserved workflow destination after login establishes a session", async ({
    page,
  }) => {
    const targetPath = `/quote/${OWNER_ORDER_NUMBER}`;
    await seedCustomerWorkflowData(page);

    await page.goto(targetPath);
    await expect(page).toHaveURL((url) => {
      return url.pathname === "/login" && url.searchParams.get("redirectTo") === targetPath;
    });

    await page.evaluate((session) => {
      window.sessionStorage.setItem("teeCoActiveCustomerSession", JSON.stringify(session));
      window.dispatchEvent(new CustomEvent("tee-co-customer-session-updated"));
    }, ownerSession);

    await expect(page).toHaveURL(targetPath);
    await expect(page.getByRole("heading", { name: /Quote Preview/i })).toBeVisible();
  });

  test("owner workflow actions still persist through protected routes", async ({ page }) => {
    await seedCustomerWorkflowData(page, { session: ownerSession });
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(`/quote/${OWNER_ORDER_NUMBER}`);
    await page.getByRole("button", { name: "Approve Quote" }).click();
    await expect
      .poll(async () => (await readSeededOrder(page))?.approval_status)
      .toBe("Approved");

    await page.goto(`/deposit-payment?order=${encodeURIComponent(OWNER_ORDER_NUMBER)}`);
    await page.getByRole("button", { name: "Confirm Payment" }).click();
    await expect(page).toHaveURL(
      `/payment-confirmed?order=${encodeURIComponent(OWNER_ORDER_NUMBER)}`
    );
    await expect
      .poll(async () => (await readSeededOrder(page))?.deposit_workflow_status)
      .toBe("Deposit Received");

    await page.goto(`/portal/requests/${OWNER_ORDER_NUMBER}/complete`);
    await page.getByRole("button", { name: /I'll Upload Artwork Later/i }).click();
    await expect(page).toHaveURL("/portal/orders");
    await expect
      .poll(async () => (await readSeededOrder(page))?.request_completion_status)
      .toBe("awaiting_artwork");
  });
});
