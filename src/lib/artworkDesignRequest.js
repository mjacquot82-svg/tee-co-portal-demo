export function needsArtworkCreation(item = {}) {
  return (item.artwork_mode || item.artworkMode) === "create";
}

export function getArtworkDescription(item = {}) {
  return String(item.artwork_description ?? item.artworkDescription ?? "").trim();
}

export function describeArtworkRequest(item = {}) {
  return needsArtworkCreation(item)
    ? `Tee & Co to create artwork: ${getArtworkDescription(item) || "Description required"}`
    : "";
}
