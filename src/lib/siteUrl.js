const DEFAULT_PRODUCTION_SITE_URL = "https://teeandco.jdsstudio.ca";

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getCanonicalSiteUrl() {
  return normalizeSiteUrl(import.meta.env?.VITE_SITE_URL) || DEFAULT_PRODUCTION_SITE_URL;
}

export function buildCanonicalUrl(path = "/") {
  return new URL(path, `${getCanonicalSiteUrl()}/`).toString();
}
