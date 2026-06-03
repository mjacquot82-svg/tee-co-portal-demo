import {
  getJsonStorageItem,
  hasBrowserStorage,
  removeStorageItem,
  setJsonStorageItem,
} from "./browserStorage";

const STORAGE_KEY = "teeCoOrderPreviewDraft";

export function getOrderPreviewDraft() {
  if (!hasBrowserStorage()) return null;

  const draft = getJsonStorageItem(STORAGE_KEY, null, { storage: "session" });
  return draft && typeof draft === "object" ? draft : null;
}

export function saveOrderPreviewDraft(draft) {
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(STORAGE_KEY, draft, { storage: "session" });
}

export function clearOrderPreviewDraft() {
  if (!hasBrowserStorage()) return false;
  return removeStorageItem(STORAGE_KEY, { storage: "session" });
}
