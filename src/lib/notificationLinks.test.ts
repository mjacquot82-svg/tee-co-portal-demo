import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDefaultMergeFields } from "./notificationDeliveryService";
import { SAMPLE_MERGE_DATA } from "./notificationTemplatesStore";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email/SMS links use the real site address", () => {
  it("defaults to the live site when VITE_SITE_URL is not set", () => {
    vi.stubEnv("VITE_SITE_URL", "");
    const fields = buildDefaultMergeFields({ order: { order_number: "TC-1001" } });
    expect(fields.approval_link).toBe("https://teeandco.jdsstudio.ca/portal/orders/TC-1001");
    expect(fields.payment_link).toBe("https://teeandco.jdsstudio.ca/portal/orders/TC-1001/deposit");
  });

  it("uses VITE_SITE_URL (e.g. staging)", () => {
    vi.stubEnv("VITE_SITE_URL", "https://teeandco-staging.netlify.app/");
    const fields = buildDefaultMergeFields({ order: { order_number: "TC 1002" } });
    expect(fields.approval_link).toBe("https://teeandco-staging.netlify.app/portal/orders/TC%201002");
    expect(fields.payment_link).toBe("https://teeandco-staging.netlify.app/portal/orders/TC%201002/deposit");
  });

  it("keeps an explicit link and the Square checkout link", () => {
    const fields = buildDefaultMergeFields({
      order: { order_number: "TC-1003" },
      approvalLink: "https://example.test/approve",
      paymentRequest: { provider_checkout_url: "https://square.link/u/abc" },
    });
    expect(fields.approval_link).toBe("https://example.test/approve");
    expect(fields.payment_link).toBe("https://square.link/u/abc");
  });

  it("no placeholder domains left", () => {
    const fields = buildDefaultMergeFields({ order: { order_number: "TC-1004" } });
    expect(JSON.stringify(fields)).not.toMatch(/teeandco\.local|teeandco\.com/);
    expect(JSON.stringify(SAMPLE_MERGE_DATA)).not.toMatch(/teeandco\.local|teeandco\.com/);
  });
});
