// @ts-check
import { expect } from "@playwright/test";

const REQUIRED_ENV_VARS = [
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_STAFF_PIN",
  "PLAYWRIGHT_STAFF_ACCOUNT_TEXT",
  "PLAYWRIGHT_CUSTOMER_TEXT",
];

export function getOperationalConfig() {
  const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !String(process.env[name] || "").trim());

  if (missingEnvVars.length > 0) {
    throw new Error(
      [
        "Operational Playwright configuration is incomplete.",
        `Missing required environment variable${missingEnvVars.length === 1 ? "" : "s"}: ${missingEnvVars.join(", ")}`,
        "Populate .env.playwright with the live workspace base URL, staff PIN, staff account text, and target customer text before running this regression workflow.",
      ].join(" ")
    );
  }

  return {
    baseUrl: String(process.env.PLAYWRIGHT_BASE_URL),
    staffPin: String(process.env.PLAYWRIGHT_STAFF_PIN),
    staffAccountText: String(process.env.PLAYWRIGHT_STAFF_ACCOUNT_TEXT),
    customerText: String(process.env.PLAYWRIGHT_CUSTOMER_TEXT),
    productionOrderText: String(process.env.PLAYWRIGHT_PRODUCTION_ORDER_TEXT || "").trim(),
  };
}

async function selectOperationalStaffAccount(page, config) {
  const staffAccountSelect = page.getByTestId("staff-pin-account-select");
  await expect(staffAccountSelect).toBeVisible();

  const preferredOption = staffAccountSelect
    .locator("option")
    .filter({ hasText: config.staffAccountText })
    .first();

  await expect(
    preferredOption,
    `Unable to find operational staff account option containing "${config.staffAccountText}".`
  ).toBeVisible();

  const preferredOptionLabel = (await preferredOption.textContent())?.trim();
  if (!preferredOptionLabel) {
    throw new Error(
      `Operational staff account option for "${config.staffAccountText}" rendered without a selectable label.`
    );
  }

  await staffAccountSelect.selectOption({ label: preferredOptionLabel });
}

export async function loginThroughOperationalPin(page, config, expectedPathname) {
  await selectOperationalStaffAccount(page, config);
  await page.getByTestId("staff-pin-input").fill(config.staffPin);
  await page.getByTestId("staff-pin-submit").click();

  const loginError = page.getByText("That PIN does not match the selected staff member.");

  try {
    await Promise.race([
      page.waitForURL((url) => url.pathname === expectedPathname, { timeout: 15_000 }),
      loginError.waitFor({ state: "visible", timeout: 15_000 }).then(() => {
        throw new Error(
          "Operational PIN login failed. Verify PLAYWRIGHT_STAFF_PIN and PLAYWRIGHT_STAFF_ACCOUNT_TEXT in .env.playwright against a real manager or owner account."
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Operational PIN login did not reach ${expectedPathname}. Verify PLAYWRIGHT_BASE_URL points at the live workspace and confirm the configured staff account can complete PIN login.`
    );
  }

  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPathname);
}
