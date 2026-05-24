const MOJIBAKE_REPLACEMENTS = [
  ["â€™", "’"],
  ["â€˜", "‘"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€\"", "”"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â„¢", "™"],
  ["Â®", "®"],
  ["Â™", "™"],
  ["Â ", " "],
];

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeGarmentText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  let normalized = String(value).replace(/^\uFEFF/, "");

  MOJIBAKE_REPLACEMENTS.forEach(([searchValue, replacement]) => {
    normalized = normalized.split(searchValue).join(replacement);
  });

  normalized = normalized
    .replace(/\u00A0/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1");

  return collapseWhitespace(normalized);
}

export function normalizeGarmentTextKey(value) {
  return normalizeGarmentText(value).toLowerCase();
}
