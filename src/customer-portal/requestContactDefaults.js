import {
  isValidCustomerName,
  normalizeCustomerName,
} from "../lib/customerName";

function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveRequestContactDefaults(customerSession = {}, profile = {}) {
  const profileName = normalizeCustomerName(profile.name);
  const authenticatedFullName = normalizeCustomerName(
    [customerSession.firstName, customerSession.lastName]
      .filter(Boolean)
      .join(" ")
  );
  const authenticatedDisplayName = normalizeCustomerName(
    customerSession.displayName
  );

  return {
    name:
      (isValidCustomerName(profileName) && profileName) ||
      (isValidCustomerName(authenticatedFullName) && authenticatedFullName) ||
      (isValidCustomerName(authenticatedDisplayName) &&
        authenticatedDisplayName) ||
      "",
    phone:
      normalizeText(profile.phone) ||
      normalizeText(customerSession.phone),
  };
}
