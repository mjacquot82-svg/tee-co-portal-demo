import { describe, expect, test } from "vitest";

import { extractMissingSchemaColumn } from "./customersStore";

describe("customer schema fallback", () => {
  test.each([
    ["column archived does not exist", "archived"],
    ["column 'archived' does not exist", "archived"],
    ["column customers.archived does not exist", "archived"],
    ['column "customers"."archived" does not exist', "archived"],
    ["Could not find the 'archived_at' column in the schema cache", "archived_at"],
  ])("extracts a missing column from %s", (message, expectedColumn) => {
    expect(extractMissingSchemaColumn({ message })).toBe(expectedColumn);
  });

  test.each([
    ["permission denied for table customers"],
    ["column customers.phone cannot be null"],
    [""],
  ])("does not misclassify an unrelated database error: %s", (message) => {
    expect(extractMissingSchemaColumn({ message })).toBe("");
  });
});
