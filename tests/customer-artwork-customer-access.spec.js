// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/customer-artwork-customer-access.sql"),
  "utf8"
);
const customerStore = fs.readFileSync(
  path.resolve(process.cwd(), "src/lib/customersStore.js"),
  "utf8"
);
const artworkService = fs.readFileSync(
  path.resolve(process.cwd(), "src/services/customerArtworkService.js"),
  "utf8"
);
const requestOrder = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "src/customer-portal/CustomerPortalRequestOrder.jsx"
  ),
  "utf8"
);

test("customer artwork policies authorize only the linked customer profile", () => {
  expect(migration).toContain(
    "customers.auth_user_id = auth.uid()::text"
  );
  expect(migration).toContain(
    "public.is_customer_artwork_owner(customer_id::text)"
  );
  expect(migration).toContain(
    "public.is_customer_artwork_owner((storage.foldername(name))[1])"
  );
  expect(migration).toContain(
    "(storage.foldername(storage_path))[1] = customer_id::text"
  );
  expect(migration).not.toMatch(
    /Customers can (?:update|delete) their own artwork/i
  );
});

test("customer profile persistence retains the authoritative Auth linkage", () => {
  expect(customerStore).toContain(
    "auth_user_id: canonicalCustomer.auth_user_id || null"
  );
  expect(migration).toContain("customer_email_counts.customer_count = 1");
  expect(migration).toContain("auth_email_counts.auth_user_count = 1");
  expect(migration).toContain(
    "set auth_user_id = unambiguous_matches.auth_user_id"
  );
});

test("operational artwork administration policies remain intact", () => {
  const operationalPolicies = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/customer-artwork-schema.sql"),
    "utf8"
  );

  expect(operationalPolicies).toContain(
    '"Operational staff can view customer artwork metadata"'
  );
  expect(operationalPolicies).toContain(
    '"Operational staff can insert customer artwork metadata"'
  );
  expect(operationalPolicies).toContain(
    '"Operational staff can upload customer artwork objects"'
  );
  expect(migration).not.toContain(
    'drop policy if exists "Operational staff'
  );
});

test("successful artwork upload persists metadata before order creation proceeds", () => {
  const uploadFunction = artworkService.slice(
    artworkService.indexOf("export async function uploadCustomerArtwork"),
    artworkService.indexOf("export async function", artworkService.indexOf("export async function uploadCustomerArtwork") + 1)
  );
  const storageUpload = uploadFunction.indexOf(
    ".upload(storagePath, file"
  );
  const metadataInsert = uploadFunction.indexOf(
    "insertArtworkMetadataWithSchemaFallback(insertPayload)"
  );
  const uploadCall = requestOrder.indexOf(
    "await uploadCustomerArtwork("
  );
  const orderCall = requestOrder.indexOf(
    "await createStoredOrder("
  );

  expect(storageUpload).toBeGreaterThan(-1);
  expect(metadataInsert).toBeGreaterThan(storageUpload);
  expect(uploadCall).toBeGreaterThan(-1);
  expect(orderCall).toBeGreaterThan(uploadCall);
});
