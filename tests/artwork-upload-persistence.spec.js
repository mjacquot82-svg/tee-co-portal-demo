// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  getOperationalConfig,
  loginThroughOperationalPin,
} from "./helpers/operationalPlaywright.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTWORK_FIXTURE_PATH = path.resolve(__dirname, "../public/icon-192.png");
const ARTWORK_FIXTURE_NAME = path.basename(ARTWORK_FIXTURE_PATH);
function getArtworkSection(page) {
  return page.getByTestId("customer-artwork-section");
}

function getArtworkCardById(scope, artworkId) {
  return scope.locator(
    `[data-testid="artwork-thumbnail"][data-artwork-id="${artworkId.replace(/"/g, '\\"')}"]`
  );
}

async function openExistingCustomer(page, config) {
  const customerRecords = page.getByTestId("customer-record-link");
  await expect(customerRecords.first()).toBeVisible();

  const targetedCustomer = customerRecords.filter({ hasText: config.customerText }).first();
  await expect(
    targetedCustomer,
    `Unable to find a customer record containing "${config.customerText}".`
  ).toBeVisible();
  await targetedCustomer.click();
}

async function waitForArtworkLibraryReady(page) {
  const artworkSection = getArtworkSection(page);
  await expect(artworkSection).toBeVisible();
  await expect(artworkSection.getByTestId("artwork-upload-button")).toBeVisible();
  await expect(artworkSection.locator(".customer-artwork-card-skeleton")).toHaveCount(0);
  return artworkSection;
}

async function captureArtworkSnapshot(artworkSection) {
  return artworkSection.getByTestId("artwork-thumbnail").evaluateAll((cards) =>
    cards.map((card) => ({
      artworkId: card.getAttribute("data-artwork-id") || "",
      fileName:
        card.querySelector(".customer-artwork-file-name")?.textContent?.trim() ||
        card.textContent?.trim() ||
        "",
    }))
  );
}

async function uploadArtworkAndWaitForPersistence(artworkSection) {
  const uploadButton = artworkSection.getByTestId("artwork-upload-button");
  const uploadInput = artworkSection.getByTestId("artwork-upload-input");
  const beforeUploadSnapshot = await captureArtworkSnapshot(artworkSection);
  const knownArtworkIds = new Set(
    beforeUploadSnapshot.map((entry) => entry.artworkId).filter(Boolean)
  );
  const initialFixtureCount = beforeUploadSnapshot.filter(
    (entry) => entry.fileName === ARTWORK_FIXTURE_NAME
  ).length;

  // Upload through the real hidden input so the workflow still exercises Supabase-backed storage.
  await uploadInput.setInputFiles(ARTWORK_FIXTURE_PATH);

  // Wait for the UI upload cycle to complete before asserting persisted artwork state.
  await expect
    .poll(
      async () => ({
        label: (await uploadButton.textContent())?.trim() || "",
        disabled: await uploadButton.isDisabled(),
      }),
      {
        message: "Expected the artwork upload control to return to its idle state after upload.",
        timeout: 30_000,
      }
    )
    .toEqual({ label: "Upload Artwork", disabled: false });
  await expect(artworkSection.locator(".customer-artwork-card-skeleton")).toHaveCount(0, {
    timeout: 30_000,
  });

  let uploadedArtworkId = "";
  await expect
    .poll(
      async () => {
        const currentSnapshot = await captureArtworkSnapshot(artworkSection);
        const uploadedArtwork = currentSnapshot.find(
          (entry) =>
            entry.fileName === ARTWORK_FIXTURE_NAME &&
            entry.artworkId &&
            !knownArtworkIds.has(entry.artworkId)
        );

        uploadedArtworkId = uploadedArtwork?.artworkId || "";
        return uploadedArtworkId;
      },
      {
        message:
          "Expected a newly persisted artwork card with a fresh data-artwork-id after upload hydration.",
        timeout: 30_000,
      }
    )
    .not.toBe("");

  const uploadedArtworkCard = getArtworkCardById(artworkSection, uploadedArtworkId);
  await expect(uploadedArtworkCard).toBeVisible();
  await expect(uploadedArtworkCard).toContainText(ARTWORK_FIXTURE_NAME);
  await expect(uploadedArtworkCard.getByTestId("artwork-thumbnail-button")).toBeVisible();

  await expect
    .poll(
      async () =>
        (await captureArtworkSnapshot(artworkSection)).filter(
          (entry) => entry.fileName === ARTWORK_FIXTURE_NAME
        ).length,
      {
        message: `Expected ${ARTWORK_FIXTURE_NAME} to remain present after upload hydration completes.`,
        timeout: 30_000,
      }
    )
    .toBe(initialFixtureCount + 1);

  return {
    uploadedArtworkId,
    expectedFixtureCount: initialFixtureCount + 1,
  };
}

async function reloadAndWaitForPersistedArtwork(page, uploadedArtworkId, expectedFixtureCount) {
  // Refreshing here proves the artwork survives a full read-back from Supabase instead of only local optimistic state.
  await page.reload();

  const artworkSection = await waitForArtworkLibraryReady(page);
  const persistedArtworkCard = getArtworkCardById(artworkSection, uploadedArtworkId);

  await expect
    .poll(
      async () =>
        (await captureArtworkSnapshot(artworkSection)).filter(
          (entry) => entry.fileName === ARTWORK_FIXTURE_NAME
        ).length,
      {
        message: `Expected ${ARTWORK_FIXTURE_NAME} to remain visible after refresh.`,
        timeout: 30_000,
      }
    )
    .toBe(expectedFixtureCount);

  await expect(
    persistedArtworkCard,
    `Persisted artwork card ${uploadedArtworkId} did not return after refresh.`
  ).toBeVisible({ timeout: 30_000 });
  await expect(persistedArtworkCard).toContainText(ARTWORK_FIXTURE_NAME);
  await expect(persistedArtworkCard.getByTestId("artwork-thumbnail-button")).toBeVisible();

  return { artworkSection, persistedArtworkCard };
}

async function openArtworkModalAndVerify(page, artworkCard, uploadedArtworkId) {
  // Opening the persisted card validates that downstream staff lookup still works against the exact uploaded record.
  await artworkCard.getByTestId("artwork-thumbnail-button").click();

  const artworkDetailModal = page.getByTestId("artwork-detail-modal");
  await expect(artworkDetailModal).toBeVisible();
  await expect(artworkDetailModal).toHaveAttribute("data-artwork-id", uploadedArtworkId);
  await expect(artworkDetailModal).toContainText("Artwork Detail");
  await expect(artworkDetailModal).toContainText(ARTWORK_FIXTURE_NAME);
  await expect(artworkDetailModal.getByText("Metadata")).toBeVisible();
  await expect(artworkDetailModal.getByTestId("artwork-metadata-badges")).toBeVisible();
  await expect(artworkDetailModal.getByText("Filename")).toBeVisible();
  await expect(artworkDetailModal.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(artworkDetailModal.getByRole("link", { name: "Download" })).toBeVisible();
}

test("customer artwork uploads persist across refreshes", async ({ page }) => {
  const config = getOperationalConfig();

  // Open the real operational login entry point instead of bypassing the staff session workflow.
  await page.goto("/login?redirectTo=/admin/customers");

  // Authenticate through the live PIN flow so this regression covers the same path staff actually use.
  await loginThroughOperationalPin(page, config, "/admin/customers");

  // Load the configured customer because artwork persistence is scoped to a real customer library record.
  await openExistingCustomer(page, config);
  const artworkSection = await waitForArtworkLibraryReady(page);

  const { uploadedArtworkId, expectedFixtureCount } =
    await uploadArtworkAndWaitForPersistence(artworkSection);

  const { persistedArtworkCard } = await reloadAndWaitForPersistedArtwork(
    page,
    uploadedArtworkId,
    expectedFixtureCount
  );

  await openArtworkModalAndVerify(page, persistedArtworkCard, uploadedArtworkId);
});
