import { expect, test } from "@playwright/test";
import {
  formatNorthAmericanPhoneDisplay,
  normalizeNorthAmericanPhoneE164,
} from "../src/lib/phoneNormalization.js";

const acceptedFormats = [
  "519-881-6869",
  "(519) 881-6869",
  "1-519-881-6869",
  "+1 519-881-6869",
  "+15198816869",
];

test("accepted North American inputs normalize to canonical E.164", () => {
  for (const input of acceptedFormats) {
    expect(normalizeNorthAmericanPhoneE164(input)).toBe("+15198816869");
  }
});

test("canonical and legacy phone values share one display format", () => {
  for (const input of acceptedFormats) {
    expect(formatNorthAmericanPhoneDisplay(input)).toBe("(519) 881-6869");
  }
});

test("empty and invalid phone values retain existing handling", () => {
  expect(normalizeNorthAmericanPhoneE164("")).toBe("");
  expect(normalizeNorthAmericanPhoneE164("555-0100")).toBe("");
  expect(formatNorthAmericanPhoneDisplay("")).toBe("");
  expect(formatNorthAmericanPhoneDisplay("555-0100")).toBe("555-0100");
});

test("non-North-American E.164 values are not reformatted as NANP numbers", () => {
  expect(normalizeNorthAmericanPhoneE164("+44 20 7946 0958")).toBe("+442079460958");
  expect(formatNorthAmericanPhoneDisplay("+44 20 7946 0958")).toBe("+44 20 7946 0958");
});
