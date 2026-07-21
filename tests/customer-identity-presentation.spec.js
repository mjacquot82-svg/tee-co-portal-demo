import { expect, test } from "@playwright/test";
import {
  getCustomerDisplayName,
  looksLikeEmailAddress,
} from "../src/lib/customerRecordMatching";

test.describe("customer identity presentation", () => {
  test("uses the canonical customer name instead of an email-shaped legacy name", () => {
    const customers = [
      {
        id: "customer-1",
        name: "Taylor Morgan",
        email: "taylor@example.com",
      },
    ];

    expect(
      getCustomerDisplayName(
        {
          customer_id: "customer-1",
          customer_name: "taylor@example.com",
          customer_email: "taylor@example.com",
        },
        customers
      )
    ).toBe("Taylor Morgan");
  });

  test("preserves a real recorded name when no saved customer is linked", () => {
    expect(
      getCustomerDisplayName(
        { customer_name: "Morgan Lee", customer_email: "morgan@example.com" },
        []
      )
    ).toBe("Morgan Lee");
  });

  test("does not promote an email address to primary identity", () => {
    expect(looksLikeEmailAddress("customer@example.com")).toBe(true);
    expect(
      getCustomerDisplayName(
        { customer_name: "customer@example.com", customer_email: "customer@example.com" },
        [],
        "Walk-in Customer"
      )
    ).toBe("Walk-in Customer");
  });
});
