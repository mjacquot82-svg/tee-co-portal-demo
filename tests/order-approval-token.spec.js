import { test, expect } from "@playwright/test";
// Fixture-only: runs when the app is built against the intercepted host below. Nothing leaves the browser.
const HOST = "https://approval-tests.supabase.co";
test.skip(process.env.VITE_SUPABASE_URL !== HOST, "Run in the isolated approval-token fixture job");

const TOKEN = "0123456789abcdef".repeat(4);
const VIEW = {
  order_number: "TC-APPROVE-1", garment: "Classic Tee", placement: "Full Front", decoration_type: "DTF",
  quantity: 12, approval_status: "Awaiting Customer", artwork_approval_status: "Pending Review",
  decided: false, decision: null, expires_at: "2099-01-01T00:00:00Z",
  artwork_files: [{ id: "f1", name: "logo.png", type: "image/png", has_preview: true }],
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function intercept(page, { getStatus = 200, getBody = VIEW, emailStatus = 200 } = {}) {
  const seen = { tableReads: [], rpc: [], previews: 0, emails: [] };
  await page.route("**/.netlify/functions/notification-event-accept", (route) => {
    const body = route.request().postDataJSON();
    seen.emails.push(body.businessEvent);
    return route.fulfill({ status: emailStatus, json: emailStatus === 200 ? { accepted: true, businessEvent: body.businessEvent } : { error: "down" } });
  });
  await page.route("**/.netlify/functions/order-approval-previews", (route) => {
    seen.previews += 1;
    return route.fulfill({ json: { ok: true, files: [{ id: "f1", url: "https://signed.approval-tests.invalid/logo.png" }] } });
  });
  await page.route("https://signed.approval-tests.invalid/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route(`${HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/rest/v1/rpc/get_order_approval") {
      seen.rpc.push({ name: "get", body: route.request().postDataJSON() });
      return route.fulfill({ status: getStatus, json: getBody });
    }
    if (url.pathname === "/rest/v1/rpc/submit_order_approval") {
      const body = route.request().postDataJSON();
      seen.rpc.push({ name: "submit", body });
      return route.fulfill({ json: { ...VIEW, decided: true, decision: body.p_decision, decided_at: "2026-10-19T17:00:00.123456+00:00" } });
    }
    if (url.pathname.startsWith("/rest/v1/orders")) seen.tableReads.push(url.pathname);
    return route.fulfill({ json: [] });
  });
  return seen;
}

test("approval link without a token explains what to do and reads nothing", async ({ page }) => {
  const seen = await intercept(page);
  await page.goto("/approval/TC-APPROVE-1");
  await expect(page.getByTestId("approval-link-problem")).toContainText("incomplete");
  await expect(page.getByRole("link", { name: /customer portal/i })).toHaveAttribute("href", "/portal/orders/TC-APPROVE-1");
  expect(seen.rpc).toEqual([]);
  expect(seen.tableReads).toEqual([]);
});

test("tokenised link shows minimum fields, preview, and records approval once", async ({ page }) => {
  const seen = await intercept(page);
  await page.goto(`/approval/TC-APPROVE-1?token=${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Review Mockup for Order TC-APPROVE-1" })).toBeVisible();
  await expect(page.getByText("Classic Tee")).toBeVisible();
  await expect(page.locator('img[alt="logo.png"]')).toHaveAttribute("src", "https://signed.approval-tests.invalid/logo.png");
  await page.getByPlaceholder("Add approval comments or requested changes here.").fill("Looks great");
  await page.getByRole("button", { name: "Approve for Production" }).click();
  await expect(page.getByTestId("approval-decided")).toContainText("approval has been recorded");
  await expect(page.getByRole("button", { name: "Approve for Production" })).toHaveCount(0);
  expect(seen.rpc.map((c) => c.name)).toEqual(["get", "submit"]);
  expect(seen.rpc[1].body).toEqual({ p_order_number: "TC-APPROVE-1", p_token: TOKEN, p_decision: "approve", p_note: "Looks great" });
  expect(seen.previews).toBe(1);
  expect(seen.tableReads).toEqual([]);
  await expect.poll(() => seen.emails.length).toBe(1);
  expect(seen.emails[0]).toMatchObject({ event_type: "quote_approved", subject_id: "TC-APPROVE-1", occurrence_id: "quote_approved:TC-APPROVE-1" });
});

test("request changes path (email service down does not block it)", async ({ page }) => {
  const seen = await intercept(page, { emailStatus: 500 });
  await page.goto(`/approval/TC-APPROVE-1?token=${TOKEN}`);
  await page.getByRole("button", { name: "Request Changes" }).click();
  await expect(page.getByTestId("approval-decided")).toContainText("change request has been sent");
  expect(seen.rpc[1].body.p_decision).toBe("request_changes");
  await expect.poll(() => seen.emails.length).toBe(1);
  expect(seen.emails[0]).toMatchObject({ event_type: "approval_changes_requested", occurrence_id: "approval_changes_requested:TC-APPROVE-1:2026-10-19T17:00:00.123456+00:00" });
});

test("expired or wrong token shows the invalid-link message", async ({ page }) => {
  await intercept(page, { getStatus: 401, getBody: { code: "28000", message: "This approval link is not valid or has expired.", details: null, hint: null } });
  await page.goto(`/approval/TC-APPROVE-1?token=${TOKEN}`);
  await expect(page.getByTestId("approval-link-problem")).toContainText("not valid or has expired");
});

test("already-decided link shows the recorded state without buttons", async ({ page }) => {
  await intercept(page, { getBody: { ...VIEW, decided: true, decision: "approve" } });
  await page.goto(`/approval/TC-APPROVE-1?token=${TOKEN}`);
  await expect(page.getByTestId("approval-decided")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);
});
