const CUSTOMER_ID_PREFIX = "customer-";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCustomerIdSuffix(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return "";

  if (normalizedValue.startsWith(CUSTOMER_ID_PREFIX)) {
    return normalizeText(normalizedValue.slice(CUSTOMER_ID_PREFIX.length));
  }

  return normalizedValue;
}

function resolveGeneratedCustomerIdSeed(fallbackValue) {
  const normalizedFallback = normalizeText(fallbackValue);
  if (/^\d+$/.test(normalizedFallback)) {
    return normalizedFallback;
  }

  const parsedTimestamp = Date.parse(normalizedFallback);
  if (Number.isFinite(parsedTimestamp) && parsedTimestamp > 0) {
    return String(parsedTimestamp);
  }

  return String(Date.now());
}

export function isCanonicalCustomerId(value) {
  return /^customer-\d+$/.test(normalizeText(value));
}

export function normalizeCustomerId(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return "";
  if (isCanonicalCustomerId(normalizedValue)) return normalizedValue;

  const suffix = normalizeCustomerIdSuffix(normalizedValue);
  if (/^\d+$/.test(suffix)) {
    return `${CUSTOMER_ID_PREFIX}${suffix}`;
  }

  return normalizedValue;
}

export function ensureCanonicalCustomerId(value, fallbackValue = "") {
  const normalizedValue = normalizeCustomerId(value);
  if (normalizedValue) return normalizedValue;

  return `${CUSTOMER_ID_PREFIX}${resolveGeneratedCustomerIdSeed(fallbackValue)}`;
}

export function buildCustomerIdLookupCandidates(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return [];

  const canonicalCustomerId = normalizeCustomerId(normalizedValue);
  const candidates = [
    canonicalCustomerId,
    normalizedValue,
    normalizeCustomerIdSuffix(normalizedValue),
    normalizeCustomerIdSuffix(canonicalCustomerId),
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function customerIdsEqual(left, right) {
  const leftCandidates = buildCustomerIdLookupCandidates(left);
  const rightCandidates = new Set(buildCustomerIdLookupCandidates(right));

  return leftCandidates.some((candidate) => rightCandidates.has(candidate));
}
