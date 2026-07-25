import { expect, test } from "@playwright/test";

test("hydrated portal profile defaults contact name and phone from linked identity", async ({ page }) => {
  await page.addInitScript(() => {
    const authUserId = "auth-contact-defaults";
    const email = "marc.contact.defaults@example.com";

    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify({
        id: authUserId,
        firstName: "",
        lastName: "",
        displayName: "Customer Account",
        email,
        phone: "",
        authMode: "supabase-session",
        isSupabaseAuthSession: true,
      })
    );
    window.localStorage.setItem(
      "teeCoCustomers",
      JSON.stringify([
        {
          id: "customer-contact-defaults",
          customer_id: "customer-contact-defaults",
          name: "Customer Account",
          email,
          phone: "519-881-6869",
          external_reference: authUserId,
          created_at: "2026-07-25T12:00:00.000Z",
          updated_at: "2026-07-25T12:00:00.000Z",
        },
      ])
    );
    window.localStorage.setItem(
      "teeCoStaffOrders",
      JSON.stringify([
        {
          id: "order-contact-defaults",
          order_number: "TC-CONTACT-DEFAULTS",
          customer_id: "customer-contact-defaults",
          customer_name: "Marc Jacquot",
          customer_email: email,
          customer_phone: "519-881-6869",
          status: "Completed",
          created_at: "2026-07-25T12:30:00.000Z",
          updated_at: "2026-07-25T12:30:00.000Z",
        },
      ])
    );
    window.sessionStorage.setItem(
      "teeCoPendingCustomerRequest",
      JSON.stringify({
        source: "public-garment-flow",
        created_at: "2026-07-25T13:00:00.000Z",
        productId: "contact-default-product",
        garmentName: "Contact Default Garment",
        quantity: 1,
      })
    );
  });

  await page.goto("/portal/request-order");
  await page.getByRole("button", { name: /Resume Draft/ }).click();
  await page.evaluate(async () => {
    const email = "marc.contact.defaults@example.com";
    const { saveStoredOrders } = await import("/src/lib/ordersStore.js");
    saveStoredOrders([
        {
          id: "order-contact-defaults",
          order_number: "TC-CONTACT-DEFAULTS",
          customer_id: "customer-contact-defaults",
          customer_name: "Marc Jacquot",
          customer_email: email,
          customer_phone: "519-881-6869",
          status: "Completed",
          created_at: "2026-07-25T12:30:00.000Z",
          updated_at: "2026-07-25T12:30:00.000Z",
        },
      ]);
  });
  const runtimeResolution = await page.evaluate(async () => {
    const {
      findCustomerProfileForSession,
      getCustomerScopedOrders,
      resolveCustomerPortalProfile,
    } = await import("/src/lib/customerPortalData.js");
    const session = JSON.parse(
      window.sessionStorage.getItem("teeCoActiveCustomerSession")
    );
    const customers = JSON.parse(window.localStorage.getItem("teeCoCustomers"));
    const orders = JSON.parse(window.localStorage.getItem("teeCoStaffOrders"));
    const profile = findCustomerProfileForSession(session, customers);
    const scopedOrders = getCustomerScopedOrders({
      session,
      customers,
      orders,
    });
    return {
      profile,
      scopedOrders,
      resolvedProfile: resolveCustomerPortalProfile(profile, scopedOrders),
    };
  });

  expect(runtimeResolution.resolvedProfile).toMatchObject({
    name: "Marc Jacquot",
    phone: "519-881-6869",
  });

  await expect(page.getByRole("textbox", { name: "Contact name (First and Last)" })).toHaveValue(
    "Marc Jacquot"
  );
  await expect(page.getByRole("textbox", { name: "Contact phone" })).toHaveValue(
    "519-881-6869"
  );

  await page.getByRole("textbox", { name: "Contact name (First and Last)" }).fill("Order Contact");
  await expect(page.getByRole("textbox", { name: "Contact name (First and Last)" })).toHaveValue(
    "Order Contact"
  );
});
