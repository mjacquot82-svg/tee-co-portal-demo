import { expect, test } from "@playwright/test";

test("authenticated customer edits canonical profile and order defaults consume it", async ({ page }) => {
  const authUserId = "auth-profile-editor";
  const email = "profile.editor@example.com";
  let persistedCustomer = {
    id: "customer-profile-editor",
    name: "Marc Jacquot",
    company: "",
    email,
    phone: "",
    notes: "",
    auth_user_id: authUserId,
    external_reference: authUserId,
    created_at: "2026-07-25T12:00:00.000Z",
    updated_at: "2026-07-25T12:00:00.000Z",
  };

  await page.route("**/rest/v1/customers*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      persistedCustomer = {
        ...persistedCustomer,
        ...request.postDataJSON(),
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        request.headers().accept?.includes("application/vnd.pgrst.object")
          ? persistedCustomer
          : [persistedCustomer]
      ),
    });
  });

  await page.addInitScript(({ session, customer }) => {
    window.sessionStorage.setItem(
      "teeCoActiveCustomerSession",
      JSON.stringify(session)
    );
    window.localStorage.setItem(
      "teeCoCustomers",
      JSON.stringify([customer])
    );
    window.localStorage.setItem("teeCoStaffOrders", JSON.stringify([]));
  }, {
    session: {
      id: authUserId,
      firstName: "Marc",
      lastName: "Jacquot",
      displayName: "Marc Jacquot",
      email,
      phone: "",
      authMode: "supabase-session",
      isSupabaseAuthSession: true,
    },
    customer: persistedCustomer,
  });

  await page.goto("/portal/account");
  await page.getByRole("button", { name: "Edit Profile" }).click();

  const emailInput = page.getByRole("textbox", { name: "Email" });
  await expect(emailInput).toHaveValue(email);
  await expect(emailInput).toHaveJSProperty("readOnly", true);

  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Marc A. Jacquot");
  await page.getByRole("textbox", { name: "Company" }).fill("Jacquot Studio");
  await page.getByRole("textbox", { name: "Phone" }).fill("519-881-6869");
  await page.getByRole("button", { name: "Save Profile" }).click();

  await expect(page.getByText("Marc A. Jacquot", { exact: true })).toBeVisible();
  await expect(page.getByText("Jacquot Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("519-881-6869", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();

  await page.evaluate(() => {
    window.sessionStorage.setItem(
      "teeCoPendingCustomerRequest",
      JSON.stringify({
        source: "public-garment-flow",
        created_at: "2026-07-25T13:00:00.000Z",
        productId: "profile-default-product",
        garmentName: "Profile Default Garment",
        quantity: 1,
      })
    );
  });
  await page.goto("/portal/request-order");
  await page.getByRole("button", { name: /Resume Draft/ }).click();

  await expect(page.getByRole("textbox", { name: "Contact name (First and Last)" })).toHaveValue(
    "Marc A. Jacquot"
  );
  await expect(page.getByRole("textbox", { name: "Contact phone" })).toHaveValue(
    "519-881-6869"
  );
});
