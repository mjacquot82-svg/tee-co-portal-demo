import { expect, test } from "@playwright/test";
import { resolveCustomerProfileIdentity } from "../src/lib/customerProfileStore";
import {
  getCustomerDisplayName,
  matchesCustomerRecord,
} from "../src/lib/customerRecordMatching";
import { normalizeCustomerSession } from "../src/lib/customerSessionStore";
import { resolveRequestContactDefaults } from "../src/customer-portal/requestContactDefaults";

test.describe("customer lifecycle identity integrity", () => {
  test("session serialization preserves an explicit full display name", () => {
    expect(
      normalizeCustomerSession({
        id: "auth-user-1",
        displayName: "Michael Jacquot",
        email: "michael@example.com",
        phone: "+15198816869",
      })
    ).toMatchObject({
      displayName: "Michael Jacquot",
      email: "michael@example.com",
      phone: "+15198816869",
    });
  });

  test("preserves a session display name separately from email, company, and phone", () => {
    expect(
      resolveCustomerProfileIdentity(
        {
          displayName: "Michael Jacquot",
          email: "michael@example.com",
          phone: "+15198816869",
        },
        {
          name: "michael@example.com",
          company: "JDS Studio",
          email: "michael@example.com",
          phone: "JDS Studio",
        }
      )
    ).toEqual({
      name: "Michael Jacquot",
      email: "michael@example.com",
      phone: "+15198816869",
    });
  });

  test("never promotes an email-shaped session display name into customer name", () => {
    expect(
      resolveCustomerProfileIdentity({
        displayName: "michael@example.com",
        email: "michael@example.com",
        phone: "+15198816869",
      })
    ).toEqual({
      name: "Customer Account",
      email: "michael@example.com",
      phone: "+15198816869",
    });
  });

  test("dropdown presentation does not use an email-shaped legacy name", () => {
    const customer = {
      id: "legacy-customer",
      name: "michael@example.com",
      email: "michael@example.com",
    };

    expect(
      getCustomerDisplayName(customer, [customer], "Customer identity unavailable")
    ).toBe("Customer identity unavailable");
  });

  test("customer lookup uses explicit order email and phone snapshot fields", () => {
    expect(
      matchesCustomerRecord(
        {
          id: "customer-1",
          name: "Michael Jacquot",
          email: "michael@example.com",
          phone: "+15198816869",
        },
        {
          customer_name: "Legacy Name",
          customer_email: "michael@example.com",
          customer_phone: "+15198816869",
        }
      )
    ).toBe(true);
  });

  test("request contact defaults prefer the authenticated customer profile", () => {
    expect(
      resolveRequestContactDefaults(
        {
          displayName: "Session Name",
          phone: "",
        },
        {
          name: "Profile Name",
          phone: "+15198816869",
        }
      )
    ).toEqual({
      name: "Profile Name",
      phone: "+15198816869",
    });
  });
});
