function normalizeText(value) {
  return String(value || "").trim();
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeArtworkRecord(file) {
  return file && typeof file === "object" ? file : null;
}

export function getArtworkDisplayName(file = {}) {
  const safeFile = normalizeArtworkRecord(file);
  if (!safeFile) return "Customer artwork";

  return (
    normalizeText(safeFile.display_name) ||
    normalizeText(safeFile.original_filename) ||
    normalizeText(safeFile.file_name) ||
    normalizeText(safeFile.name) ||
    "Customer artwork"
  );
}

export function normalizeArtworkFile(file = {}) {
  const safeFile = normalizeArtworkRecord(file);
  if (!safeFile) return null;

  const displayName = getArtworkDisplayName(safeFile);
  const type = normalizeText(safeFile.type) || normalizeText(safeFile.file_type);
  const size = Number(safeFile.size ?? safeFile.file_size ?? 0) || 0;
  const assetUrl =
    normalizeText(safeFile.asset_url) ||
    normalizeText(safeFile.url) ||
    normalizeText(safeFile.source_url) ||
    normalizeText(safeFile.preview_url) ||
    normalizeText(safeFile.preview);
  const previewUrl =
    normalizeText(safeFile.preview_url) ||
    normalizeText(safeFile.preview) ||
    assetUrl;

  return {
    ...safeFile,
    id: safeFile.id || `artwork-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: displayName,
    display_name: normalizeText(safeFile.display_name) || displayName,
    file_name:
      normalizeText(safeFile.file_name) ||
      normalizeText(safeFile.original_filename) ||
      displayName,
    original_filename:
      normalizeText(safeFile.original_filename) ||
      normalizeText(safeFile.file_name) ||
      displayName,
    type,
    file_type: type,
    size,
    file_size: size,
    asset_url: assetUrl,
    source_url: normalizeText(safeFile.source_url) || assetUrl,
    url: normalizeText(safeFile.url) || assetUrl,
    asset_reference:
      normalizeText(safeFile.asset_reference) ||
      normalizeText(safeFile.asset_id) ||
      assetUrl ||
      safeFile.id ||
      "",
    preview: previewUrl,
    preview_url: previewUrl,
  };
}

function buildFallbackArtworkFiles(fallbackNames = []) {
  return uniqueValues(fallbackNames.map((value) => normalizeText(value))).map((name) =>
    normalizeArtworkFile({
      id: `artwork-reference-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      file_name: name,
      original_filename: name,
      source: "order-metadata",
    })
  );
}

export function getOrderArtworkFiles(order = {}) {
  const safeOrder = order && typeof order === "object" ? order : {};
  const storedFiles = Array.isArray(safeOrder.artwork_files)
    ? safeOrder.artwork_files.map((file) => normalizeArtworkFile(file)).filter(Boolean)
    : [];

  if (storedFiles.length) {
    return storedFiles;
  }

  const placementArtworkNames = Array.isArray(safeOrder.placements)
    ? safeOrder.placements
        .map((placement) => placement?.artwork_name || placement?.customer_artwork_name)
        .filter(Boolean)
    : [];

  return buildFallbackArtworkFiles([
    safeOrder.customer_artwork_name,
    ...placementArtworkNames,
  ]);
}

export function getOrderArtworkNames(order = {}) {
  return getOrderArtworkFiles(order).map((file) => getArtworkDisplayName(file));
}

export function getArtworkAssetUrl(file = {}) {
  const safeFile = normalizeArtworkRecord(file);
  if (!safeFile) return "";

  return normalizeText(
    safeFile.asset_url ||
      safeFile.url ||
      safeFile.source_url ||
      safeFile.preview_url ||
      safeFile.preview
  );
}

export function isArtworkImage(file = {}) {
  const safeFile = normalizeArtworkRecord(file);
  if (!safeFile) return false;

  const type = normalizeText(safeFile.type || safeFile.file_type).toLowerCase();
  if (type.startsWith("image/")) {
    return true;
  }

  const fileName = getArtworkDisplayName(safeFile).toLowerCase();
  return /\.(avif|gif|jpe?g|png|svg|webp|bmp|tiff?)$/.test(fileName);
}
