function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function uniquePlacements(values = []) {
  const seen = new Set();
  const placements = [];

  values.forEach((value) => {
    const label = normalizeText(value);
    const key = normalizeTextKey(label);
    if (!label || seen.has(key)) return;
    seen.add(key);
    placements.push(label);
  });

  return placements;
}

export const COMMON_PLACEMENT_OPTIONS = [
  "Left Chest",
  "Right Chest",
  "Full Front",
  "Center Chest",
  "Full Back",
  "Upper Back",
  "Sleeve",
  "Left Sleeve",
  "Right Sleeve",
  "Front",
  "Left Side",
  "Back",
  "Front Panel",
  "Side Panel",
  "Yoke",
];

const GARMENT_PLACEMENT_TEMPLATES = {
  hats: ["Front", "Left Side", "Back"],
  "t-shirts": ["Left Chest", "Full Front", "Full Back"],
  tees: ["Left Chest", "Full Front", "Full Back"],
  hoodies: ["Left Chest", "Full Front", "Full Back", "Sleeve"],
  crewnecks: ["Left Chest", "Full Front", "Full Back"],
};

function getGarmentTemplateKey({ categoryName = "", garmentType = "", displayName = "" } = {}) {
  const haystack = [categoryName, garmentType, displayName]
    .map((value) => normalizeTextKey(value))
    .filter(Boolean)
    .join(" ");

  if (!haystack) return "";
  if (/(hat|cap|snapback|trucker|beanie)/.test(haystack)) return "hats";
  if (/hood(ie|ed)/.test(haystack)) return "hoodies";
  if (/(crewneck|sweatshirt|fleece crew)/.test(haystack)) return "crewnecks";
  if (/(t-shirt|tee shirt|tee|jersey tee|shirt)/.test(haystack)) return "t-shirts";

  const categoryKey = normalizeTextKey(categoryName);
  if (GARMENT_PLACEMENT_TEMPLATES[categoryKey]) return categoryKey;
  return "";
}

export function getSuggestedGarmentPlacements(context = {}) {
  const hasContext = [context.categoryName, context.garmentType, context.displayName].some(
    (value) => normalizeText(value)
  );
  if (!hasContext) return [];

  const templateKey = getGarmentTemplateKey(context);
  const template = GARMENT_PLACEMENT_TEMPLATES[templateKey];

  if (template?.length) {
    return uniquePlacements(template);
  }

  return uniquePlacements(["Left Chest", "Full Front", "Full Back"]);
}

export function getPlacementOptionsForGarment(context = {}) {
  const suggested = getSuggestedGarmentPlacements(context);
  const suggestedKeys = new Set(suggested.map((placement) => normalizeTextKey(placement)));
  const remaining = COMMON_PLACEMENT_OPTIONS.filter(
    (placement) => !suggestedKeys.has(normalizeTextKey(placement))
  );

  return [...suggested, ...remaining];
}

export function arePlacementListsEqual(left = [], right = []) {
  if (left.length !== right.length) return false;

  return left.every(
    (placement, index) => normalizeTextKey(placement) === normalizeTextKey(right[index])
  );
}
