// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
const STAFF_PIN = process.env.PLAYWRIGHT_STAFF_PIN || "1234";
const STAFF_ACCOUNT_TEXT = process.env.PLAYWRIGHT_STAFF_ACCOUNT_TEXT || "";
const TARGET_CUSTOMER_TEXT = process.env.PLAYWRIGHT_CUSTOMER_TEXT || "";
const ARTWORK_FIXTURE_PATH = path.resolve(__dirname, "../public/icon-192.png");
const ARTWORK_FIXTURE_NAME = path.basename(ARTWORK_FIXTURE_PATH);

async function selectOperationalStaffAccount(page) {
  const staffAccountSelect = page.getByTestId("staff-pin-account-select");
  await expect(staffAccountSelect).toBeVisible();

  const optionLabels = await staffAccountSelect.locator("option").evaluateAll((options) =>
    options.map((option) => option.textContent?.trim() || "")
  );

  const preferredOption =
    optionLabels.find((label) => STAFF_ACCOUNT_TEXT && label.includes(STAFF_ACCOUNT_TEXT)) ||
    optionLabels.find((label) => /\((Owner|Manager)\)/.test(label)) ||
    optionLabels[0];

  if (preferredOption) {
    await staffAccountSelect.selectOption({ label: preferredOption });
  }
}

async function loginThroughOperationalPin(page) {
  await selectOperationalStaffAccount(page);
  await page.getByTestId("staff-pin-input").fill(STAFF_PIN);
  await page.getByTestId("staff-pin-submit").click();

  const loginError = page.getByText("That PIN does not match the selected staff member.");

  try {
    await Promise.race([
      page.waitForURL((url) => url.pathname === "/admin/customers", { timeout: 10_000 }),
      loginError.waitFor({ state: "visible", timeout: 10_000 }).then(() => {
        throw new Error(
          "Operational PIN login failed. Set PLAYWRIGHT_STAFF_PIN and, if needed, PLAYWRIGHT_STAFF_ACCOUNT_TEXT for a manager or owner account in this workspace."
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Operational PIN login did not reach /admin/customers. Verify the workspace has an owner or manager account and set PLAYWRIGHT_STAFF_PIN if the default PIN does not apply."
    );
  }

  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/customers");
}

async function openExistingCustomer(page) {
  const customerRecords = page.getByTestId("customer-record-link");
  await expect(customerRecords.first()).toBeVisible();

  if (TARGET_CUSTOMER_TEXT) {
    const targetedCustomer = customerRecords.filter({ hasText: TARGET_CUSTOMER_TEXT }).first();
    await expect(targetedCustomer).toBeVisible();
    await targetedCustomer.click();
    return;
  }

  await customerRecords.first().click();
}

test("customer artwork uploads persist across refreshes", async ({ page }) => {
  // Step 1: Open the live local workspace so the test exercises the same entry point staff use in production.
  await page.goto(`${APP_URL}/login?redirectTo=/admin/customers`);

  // Step 2: Authenticate through the operational PIN workflow instead of bypassing session creation.
  await loginThroughOperationalPin(page);

  // Step 3: Open an existing customer record because artwork persistence is tied to a real customer library.
  await openExistingCustomer(page);
  await expect(page.getByTestId("customer-artwork-section")).toBeVisible();

  const artworkSection = page.getByTestId("customer-artwork-section");
  const matchingThumbnails = artworkSection
    .getByTestId("artwork-thumbnail")
    .filter({ hasText: ARTWORK_FIXTURE_NAME });
  const initialMatchingCount = await matchingThumbnails.count();

  // Step 4: Upload a real image fixture through the actual hidden file input used by staff.
  await artworkSection.getByTestId("artwork-upload-input").setInputFiles(ARTWORK_FIXTURE_PATH);

  // Step 5: Confirm the uploaded artwork appears in the customer artwork library before moving on.
  await expect
    .poll(async () => await matchingThumbnails.count(), {
      message: `expected a new ${ARTWORK_FIXTURE_NAME} thumbnail to appear after upload`,
    })
    .toBe(initialMatchingCount + 1);

  const uploadedThumbnail = matchingThumbnails.first();
  await expect(uploadedThumbnail).toBeVisible();

  // Step 6: Refresh the page to prove the artwork reloads from the persisted Supabase-backed source of truth.
  await page.reload();
  await expect(page.getByTestId("customer-artwork-section")).toBeVisible();

  // Step 7: Verify the uploaded artwork still exists after refresh, which confirms persistence rather than optimistic UI only.
  const persistedThumbnails = page
    .getByTestId("customer-artwork-section")
    .getByTestId("artwork-thumbnail")
    .filter({ hasText: ARTWORK_FIXTURE_NAME });
  await expect
    .poll(async () => await persistedThumbnails.count(), {
      message: `expected ${ARTWORK_FIXTURE_NAME} to remain visible after refresh`,
    })
    .toBe(initialMatchingCount + 1);

  const persistedThumbnail = persistedThumbnails.first();
  await expect(persistedThumbnail).toBeVisible();

  // Step 8: Open the artwork detail modal from the persisted record to validate downstream operational access.
  await persistedThumbnail.getByTestId("artwork-thumbnail-button").click();

  // Step 9: Confirm the detail modal loads with the expected artifact metadata and actions.
  const artworkDetailModal = page.getByTestId("artwork-detail-modal");
  await expect(artworkDetailModal).toBeVisible();
  await expect(artworkDetailModal).toContainText("Artwork Detail");
  await expect(artworkDetailModal).toContainText(ARTWORK_FIXTURE_NAME);
  await expect(artworkDetailModal.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(artworkDetailModal.getByRole("link", { name: "Download" })).toBeVisible();
});
