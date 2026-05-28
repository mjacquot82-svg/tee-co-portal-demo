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

  const normalizedStaffPin = String(process.env.PLAYWRIGHT_STAFF_PIN || "")
    .replace(/\D/g, "")
    .slice(0, 4);

  if (normalizedStaffPin.length !== 4) {
    throw new Error(
      "Operational Playwright configuration is invalid. PLAYWRIGHT_STAFF_PIN must be a real 4-digit staff PIN in .env.playwright so the live PIN form can accept it."
    );
  }

  return {
    baseUrl: String(process.env.PLAYWRIGHT_BASE_URL),
    staffPin: normalizedStaffPin,
    staffAccountText: String(process.env.PLAYWRIGHT_STAFF_ACCOUNT_TEXT),
    customerText: String(process.env.PLAYWRIGHT_CUSTOMER_TEXT),
    productionOrderText: String(process.env.PLAYWRIGHT_PRODUCTION_ORDER_TEXT || "").trim(),
  };
}

async function selectOperationalStaffAccount(page, config) {
  const staffAccountSelect = page.getByTestId("staff-pin-account-select");
  await expect(staffAccountSelect).toBeVisible();

  let options = [];
  let previousLabels = "";
  let stableReads = 0;
  const timeoutAt = Date.now() + 5_000;

  while (Date.now() < timeoutAt) {
    options = await staffAccountSelect.locator("option").evaluateAll((nodes) =>
      nodes.map((node, index) => ({
        index,
        value: node.value,
        label: (node.label || node.textContent || "").trim(),
      }))
    );

    const labels = options.map((option) => option.label).filter(Boolean).join(" | ");
    if (labels && labels === previousLabels) {
      stableReads += 1;
    } else {
      stableReads = 0;
      previousLabels = labels;
    }

    if (labels && stableReads >= 2) {
      break;
    }

    await page.waitForTimeout(200);
  }

  const availableLabels = options.map((option) => option.label).filter(Boolean);
  console.log("[operational-login] available staff accounts:", availableLabels.join(" | "));

  const normalizedTarget = config.staffAccountText.trim().toLowerCase();
  const preferredOption = options.find((option) => option.label.toLowerCase().includes(normalizedTarget));

  if (!preferredOption) {
    throw new Error(
      `Unable to find operational staff account option containing "${config.staffAccountText}". Available options: ${availableLabels.join(", ")}`
    );
  }

  const selectedValues =
    preferredOption.value !== ""
      ? await staffAccountSelect.selectOption({ value: preferredOption.value })
      : await staffAccountSelect.selectOption({ label: preferredOption.label });

  if (!selectedValues.includes(preferredOption.value)) {
    throw new Error(
      `Operational staff account selection did not persist for "${preferredOption.label}".`
    );
  }

  console.log("[operational-login] selected staff account:", preferredOption.label);
}

function getOperationalSuccessMarkers(page, expectedPathname) {
  if (expectedPathname === "/admin/customers") {
    return [
      {
        name: "customer lookup heading",
        locator: page.getByRole("heading", { name: "Customer Lookup" }),
      },
      {
        name: "customer records list",
        locator: page.getByTestId("customer-records-list"),
      },
    ];
  }

  if (expectedPathname === "/admin/orders") {
    return [
      {
        name: "production queue page",
        locator: page.getByTestId("production-queue-page"),
      },
      {
        name: "production queue search",
        locator: page.getByTestId("production-queue-search"),
      },
    ];
  }

  return [];
}

async function installOperationalLoginDebugHooks(page) {
  const installDebugHooks = () => {
    const debugKey = "__PW_OPERATIONAL_LOGIN_DEBUG__";

    if (!window[debugKey]) {
      window[debugKey] = {
        routeChanges: [],
      };
    }

    if (window[debugKey].installed) {
      return;
    }

    const debugState = window[debugKey];
    const captureRouteChange = (type) => {
      const nextEntry = {
        type,
        url: window.location.pathname + window.location.search + window.location.hash,
        timestamp: new Date().toISOString(),
      };

      debugState.routeChanges = [...(debugState.routeChanges || []).slice(-19), nextEntry];
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args) => {
      const result = originalPushState(...args);
      captureRouteChange("pushState");
      return result;
    };

    window.history.replaceState = (...args) => {
      const result = originalReplaceState(...args);
      captureRouteChange("replaceState");
      return result;
    };

    window.addEventListener("popstate", () => captureRouteChange("popstate"));
    window.addEventListener("hashchange", () => captureRouteChange("hashchange"));

    captureRouteChange("initial");
    debugState.installed = true;
  };

  await page.addInitScript(installDebugHooks);
  await page.evaluate(installDebugHooks);
}

async function getVisibleOperationalMarkers(markers) {
  const visibleMarkers = [];

  for (const marker of markers) {
    if (await marker.locator.isVisible().catch(() => false)) {
      visibleMarkers.push(marker.name);
    }
  }

  return visibleMarkers;
}

async function readOperationalLoginDebugSnapshot(page) {
  return page.evaluate(() => {
    const debugState = window.__PW_OPERATIONAL_LOGIN_DEBUG__ || {};
    const authDiagnostics = Array.isArray(window.__TEE_CO_AUTH_DIAGNOSTICS__)
      ? window.__TEE_CO_AUTH_DIAGNOSTICS__.slice(-8)
      : [];
    const ownerDiagnostics = Array.isArray(window.__TEE_CO_OWNER_AUTH_DIAGNOSTICS__)
      ? window.__TEE_CO_OWNER_AUTH_DIAGNOSTICS__.slice(-8)
      : [];
    const sessionStorageEntries = [];
    const localStorageEntries = [];

    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key || !key.toLowerCase().includes("tee")) continue;
      sessionStorageEntries.push([key, window.sessionStorage.getItem(key)]);
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.toLowerCase().includes("tee")) continue;
      localStorageEntries.push([key, window.localStorage.getItem(key)]);
    }

    return {
      href: window.location.href,
      pathname: window.location.pathname,
      routeChanges: Array.isArray(debugState.routeChanges) ? debugState.routeChanges.slice(-8) : [],
      authDiagnostics,
      ownerDiagnostics,
      sessionStorageEntries,
      localStorageEntries,
    };
  });
}

export async function loginThroughOperationalPin(page, config, expectedPathname) {
  await installOperationalLoginDebugHooks(page);
  await selectOperationalStaffAccount(page, config);
  const staffPinInput = page.getByTestId("staff-pin-input");
  await staffPinInput.fill(config.staffPin);
  await expect(staffPinInput).toHaveValue(config.staffPin);

  const loginSubmitButton = page.getByTestId("staff-pin-submit");
  const loginError = page.getByText("That PIN does not match the selected staff member.");
  const pinValidationError = page.getByText("Enter the 4-digit PIN.");
  const successMarkers = getOperationalSuccessMarkers(page, expectedPathname);

  console.log("[operational-login] before submit:", {
    url: page.url(),
    expectedPathname,
  });

  await loginSubmitButton.click();

  console.log("[operational-login] submitted PIN; waiting for authenticated workspace");

  const timeoutAt = Date.now() + 15_000;
  let lastSnapshot = null;

  while (Date.now() < timeoutAt) {
    const visibleMarkers = await getVisibleOperationalMarkers(successMarkers);
    const currentUrl = page.url();
    const currentPathname = new URL(currentUrl).pathname;
    const loginButtonVisible = await loginSubmitButton.isVisible().catch(() => false);
    const loginErrorVisible = await loginError.isVisible().catch(() => false);
    const pinValidationErrorVisible = await pinValidationError.isVisible().catch(() => false);
    const debugSnapshot = await readOperationalLoginDebugSnapshot(page).catch(() => null);

    lastSnapshot = {
      currentUrl,
      currentPathname,
      loginButtonVisible,
      visibleMarkers,
      pinValidationErrorVisible,
      debugSnapshot,
    };

    if (loginErrorVisible) {
      console.log("[operational-login] login error became visible:", {
        url: currentUrl,
        authDiagnostics: debugSnapshot?.authDiagnostics || [],
        ownerDiagnostics: debugSnapshot?.ownerDiagnostics || [],
      });

      throw new Error(
        "Operational PIN login failed. Verify PLAYWRIGHT_STAFF_PIN and PLAYWRIGHT_STAFF_ACCOUNT_TEXT in .env.playwright against a real manager or owner account."
      );
    }

    if (pinValidationErrorVisible) {
      throw new Error(
        [
          "Operational PIN submission did not persist the 4-digit value before the form handler ran.",
          `Current URL: ${currentUrl}`,
          `Route changes: ${JSON.stringify(debugSnapshot?.routeChanges || [])}`,
          `Auth diagnostics: ${JSON.stringify(debugSnapshot?.authDiagnostics || [])}`,
        ].join(" ")
      );
    }

    const reachedExpectedPath = currentPathname === expectedPathname;
    const foundExpectedWorkspaceMarker = visibleMarkers.length > 0;

    if (reachedExpectedPath || foundExpectedWorkspaceMarker) {
      console.log("[operational-login] post-submit state:", {
        url: currentUrl,
        pathname: currentPathname,
        visibleMarkers,
        routeChanges: debugSnapshot?.routeChanges || [],
        authDiagnostics: debugSnapshot?.authDiagnostics || [],
        ownerDiagnostics: debugSnapshot?.ownerDiagnostics || [],
      });
      break;
    }

    await page.waitForTimeout(250);
  }

  if (!lastSnapshot) {
    throw new Error("Operational PIN login did not produce any observable post-submit state.");
  }

  if (
    lastSnapshot.currentPathname !== expectedPathname &&
    lastSnapshot.visibleMarkers.length === 0
  ) {
    throw new Error(
      [
        `Operational PIN login did not stabilize on ${expectedPathname}.`,
        `Current URL: ${lastSnapshot.currentUrl}`,
        `Visible workspace markers: ${lastSnapshot.visibleMarkers.join(", ") || "none"}`,
        `Route changes: ${JSON.stringify(lastSnapshot.debugSnapshot?.routeChanges || [])}`,
        `Auth diagnostics: ${JSON.stringify(lastSnapshot.debugSnapshot?.authDiagnostics || [])}`,
        `Owner diagnostics: ${JSON.stringify(lastSnapshot.debugSnapshot?.ownerDiagnostics || [])}`,
        `Session storage: ${JSON.stringify(lastSnapshot.debugSnapshot?.sessionStorageEntries || [])}`,
        `Local storage: ${JSON.stringify(lastSnapshot.debugSnapshot?.localStorageEntries || [])}`,
      ].join(" ")
    );
  }

  if (successMarkers.length > 0) {
    await expect
      .poll(() => getVisibleOperationalMarkers(successMarkers), {
        message: `Expected an operational workspace marker for ${expectedPathname} after PIN login.`,
        timeout: 15_000,
      })
      .not.toHaveLength(0);
  }
}
