function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function uniqueValues(values = []) {
  const seen = new Set();

  return values.reduce((result, value) => {
    const normalizedValue = normalizeText(value);
    const key = normalizeTextKey(normalizedValue);
    if (!key || seen.has(key)) return result;
    seen.add(key);
    result.push(normalizedValue);
    return result;
  }, []);
}

export function isManualStorefrontProduct(product = {}) {
  return !normalizeText(product?.garment_library_item_id);
}

export function normalizeProductCharacteristics(characteristics = []) {
  return (Array.isArray(characteristics) ? characteristics : [])
    .map((characteristic) => ({
      name: normalizeText(characteristic?.name),
      values: uniqueValues(characteristic?.values),
    }))
    .filter((characteristic) => characteristic.name && characteristic.values.length > 0);
}

export function buildLegacyManualCharacteristics(product = {}) {
  if (!isManualStorefrontProduct(product)) return [];

  const legacyCharacteristics = [];
  const colors = uniqueValues(product?.colors);
  const sizes = uniqueValues(product?.sizes);

  if (colors.length) {
    legacyCharacteristics.push({
      name: "Color",
      values: colors,
    });
  }

  if (sizes.length) {
    legacyCharacteristics.push({
      name: "Size",
      values: sizes,
    });
  }

  return legacyCharacteristics;
}

export function getProductCharacteristics(product = {}) {
  const normalizedCharacteristics = normalizeProductCharacteristics(product?.characteristics);
  if (normalizedCharacteristics.length) {
    return normalizedCharacteristics;
  }

  return buildLegacyManualCharacteristics(product);
}

export function summarizeCharacteristics(characteristics = []) {
  return normalizeProductCharacteristics(characteristics)
    .map((characteristic) => {
      const preview = characteristic.values.slice(0, 3).join(", ");
      const remainder = characteristic.values.length - 3;
      return remainder > 0
        ? `${characteristic.name}: ${preview} +${remainder} more`
        : `${characteristic.name}: ${preview}`;
    })
    .filter(Boolean);
}
