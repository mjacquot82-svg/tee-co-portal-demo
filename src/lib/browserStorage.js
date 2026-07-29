function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function getStorageArea(storage = "local") {
  if (!canUseBrowserStorage()) return null;
  return storage === "session" ? window.sessionStorage : window.localStorage;
}

export function getRawStorageItem(key, options = {}) {
  const storageArea = getStorageArea(options.storage);
  if (!storageArea) return null;

  try {
    return storageArea.getItem(key);
  } catch (error) {
    console.error(`Unable to read browser storage key "${key}"`, error);
    return null;
  }
}

export function setRawStorageItem(key, value, options = {}) {
  const storageArea = getStorageArea(options.storage);
  if (!storageArea) return false;

  const maxBytes = Number(options.maxBytes || 0);
  if (maxBytes > 0 && new Blob([String(value)]).size > maxBytes) {
    try {
      storageArea.removeItem(key);
    } catch {
      // The authoritative in-memory snapshot remains available even if stale
      // browser cache cleanup is unavailable.
    }
    return false;
  }

  try {
    storageArea.setItem(key, value);
    return true;
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      try {
        storageArea.removeItem(key);
      } catch {
        // Ignore cleanup failures and keep the authoritative in-memory value.
      }
      return false;
    }
    console.error(`Unable to write browser storage key "${key}"`, error);
    return false;
  }
}

export function removeStorageItem(key, options = {}) {
  const storageArea = getStorageArea(options.storage);
  if (!storageArea) return false;

  try {
    storageArea.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Unable to remove browser storage key "${key}"`, error);
    return false;
  }
}

export function getJsonStorageItem(key, fallbackValue, options = {}) {
  const rawValue = getRawStorageItem(key, options);

  if (!rawValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.error(`Unable to parse browser storage key "${key}"`, error);
    return fallbackValue;
  }
}

export function setJsonStorageItem(key, value, options = {}) {
  return setRawStorageItem(key, JSON.stringify(value), options);
}

export function hasBrowserStorage() {
  return canUseBrowserStorage();
}
