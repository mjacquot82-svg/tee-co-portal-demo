function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveCustomerIdentity(input = {}) {
  const recordedName = normalizeText(input.customer_name || input.name);
  const nameParts = recordedName.split(/\s+/).filter(Boolean);
  const firstName = normalizeText(input.customer_first_name || input.first_name) || nameParts[0] || "";
  const lastName =
    normalizeText(input.customer_last_name || input.last_name) ||
    (nameParts.length > 1 ? nameParts.slice(1).join(" ") : "");
  const phone = normalizeText(input.customer_phone || input.phone);

  return {
    firstName,
    lastName,
    phone,
    displayName: [firstName, lastName].filter(Boolean).join(" "),
  };
}

export function validateCustomerIdentity(input = {}) {
  const identity = resolveCustomerIdentity(input);
  const missingFields = [];

  if (!identity.firstName) missingFields.push("First Name");
  if (!identity.lastName) missingFields.push("Last Name");
  if (!identity.phone) missingFields.push("Phone Number");

  return {
    valid: missingFields.length === 0,
    missingFields,
    identity,
    message: missingFields.length
      ? `Customer identity is required. Enter ${missingFields.join(", ")} before submitting the order.`
      : "",
  };
}

export function requireCustomerIdentity(input = {}) {
  const validation = validateCustomerIdentity(input);
  if (validation.valid) return validation.identity;

  const error = new Error(validation.message);
  error.code = "CUSTOMER_IDENTITY_REQUIRED";
  error.missingFields = validation.missingFields;
  throw error;
}
