function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveRequestContactDefaults(customerSession = {}, profile = {}) {
  return {
    name:
      normalizeText(profile.name) ||
      normalizeText(customerSession.displayName),
    phone:
      normalizeText(profile.phone) ||
      normalizeText(customerSession.phone),
  };
}
