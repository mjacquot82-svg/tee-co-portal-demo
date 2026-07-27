import { expect, test } from "@playwright/test";

const authUserId = "auth-hydration-fallback";
const customerId = "customer-hydration-fallback";
const email = "hydration.fallback@example.com";

test("customer hydration retries missing optional columns and replaces stale local profile data", async ({
  page,
}) => {
  const requestedSelects = [];
  const productionCustomer = {
    id: customerId,
    name: "Hydrated Customer",
    company: "Production Company",
    email,
    phone: "+15198816869",
    notes: "",
    auth_user_id: authUserId,
    external_reference: authUserId,
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T13:00:00.000Z",
  };

  await page.route("**/rest/v1/customers*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const select = requestUrl.searchParams.get("select") || "";
    requestedSelects.push(select);

    if (requestedSelects.length === 1) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42703",
          message: "column customers.archived does not exist",
        }),
      });
      return;
    }

    if (requestedSelects.length === 2) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42703",
          message: 'column "customers"."archived_at" does not exist',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([productionCustomer]),
    });
  });

  await page.addInitScript(({ session, staleCustomer }) => {
    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify(session)
    );
    window.localStorage.setItem(
      "teeCoCustomers",
      JSON.stringify([staleCustomer])
    );
    window.localStorage.setItem("teeCoStaffOrders", JSON.stringify([]));
  }, {
    session: {
      id: authUserId,
      firstName: "Hydrated",
      lastName: "Customer",
      displayName: "Hydrated Customer",
      email,
      phone: "",
      authMode: "supabase-session",
      isSupabaseAuthSession: true,
    },
    staleCustomer: {
      ...productionCustomer,
      company: "",
      phone: "",
      updated_at: "2026-07-26T12:00:00.000Z",
    },
  });

  await page.goto("/portal/account");

  await expect(page.getByText("Production Company", { exact: true })).toBeVisible();
  await expect(page.getByText("(519) 881-6869", { exact: true })).toBeVisible();
  await expect.poll(() => requestedSelects.length).toBe(3);

  expect(requestedSelects[0]).toContain("archived");
  expect(requestedSelects[1]).not.toContain("archived,");
  expect(requestedSelects[1]).toContain("archived_at");
  expect(requestedSelects[2]).not.toContain("archived_at");
  expect(requestedSelects[2]).toContain("phone");
  expect(requestedSelects[2]).toContain("company");

  const cachedCustomer = await page.evaluate((id) => {
    const customers = JSON.parse(
      window.localStorage.getItem("teeCoCustomers") || "[]"
    );
    return customers.find((customer) => customer.id === id);
  }, customerId);

  expect(cachedCustomer).toMatchObject({
    company: "Production Company",
    phone: "+15198816869",
  });
});
