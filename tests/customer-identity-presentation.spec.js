import { expect, test } from "@playwright/test";
import {
  getCustomerDisplayName,
  looksLikeEmailAddress,
} from "../src/lib/customerRecordMatching";
import {
  requireCustomerIdentity,
  resolveCustomerIdentity,
  validateCustomerIdentity,
} from "../src/lib/customerIdentity";

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
        "Customer identity unavailable"
      )
    ).toBe("Customer identity unavailable");
  });

  [
    [{ customer_name: "Morgan Lee", customer_phone: "555-0100" }, []],
    [{ customer_name: "Morgan", customer_phone: "555-0100" }, ["Last Name"]],
    [{ customer_last_name: "Lee", customer_phone: "555-0100" }, ["First Name"]],
    [{ customer_name: "Morgan Lee" }, ["Phone Number"]],
  ].forEach(([input, missingFields]) => {
    test(`requires order identity fields; missing: ${missingFields.join(", ") || "none"}`, () => {
      const validation = validateCustomerIdentity(input);

      expect(validation.missingFields).toEqual(missingFields);
      expect(validation.valid).toBe(missingFields.length === 0);
    });
  });

  test("normalizes explicit identity fields without mixing in Order Source", () => {
    expect(
      resolveCustomerIdentity({
        customer_first_name: "Morgan",
        customer_last_name: "Lee",
        customer_phone: "555-0100",
        source: "Walk-in",
      })
    ).toEqual({
      firstName: "Morgan",
      lastName: "Lee",
      phone: "555-0100",
      displayName: "Morgan Lee",
    });
  });

  test("rejects anonymous order identity with a clear persistence error", () => {
    expect(() =>
      requireCustomerIdentity({
        customer_name: "",
        customer_phone: "",
        source: "Walk-in",
      })
    ).toThrow(
      "Customer identity is required. Enter First Name, Last Name, Phone Number before submitting the order."
    );
  });
});
