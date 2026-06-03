import {
  getJsonStorageItem,
  hasBrowserStorage,
  removeStorageItem,
  setJsonStorageItem,
} from "./browserStorage";

const STORAGE_KEY = "teeCoCheckoutAuthReturn";

export function markCheckoutAuthReturn() {
  if (!hasBrowserStorage()) return false;

  return setJsonStorageItem(
    STORAGE_KEY,
    {
      savedAt: new Date().toISOString(),
    },
    { storage: "session" }
  );
}

export function consumeCheckoutAuthReturn() {
  if (!hasBrowserStorage()) return null;

  const payload = getJsonStorageItem(STORAGE_KEY, null, { storage: "session" });
  removeStorageItem(STORAGE_KEY, { storage: "session" });
  return payload && typeof payload === "object" ? payload : null;
}
