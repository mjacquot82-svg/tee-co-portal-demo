const DATABASE_NAME = "teeCoPendingCustomerArtwork";
const DATABASE_VERSION = 1;
const STORE_NAME = "pendingArtwork";
const RECORD_KEY = "current";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

let memoryArtwork = null;

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open pending artwork storage."));
  });
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to access pending artwork storage."));
    });
  } finally {
    database.close();
  }
}

export async function savePendingCustomerArtwork(file) {
  if (!file) {
    await clearPendingCustomerArtwork();
    return true;
  }

  const record = {
    file,
    createdAt: Date.now(),
    name: String(file.name || "customer-artwork"),
    type: String(file.type || ""),
    lastModified: Number(file.lastModified || Date.now()),
  };
  memoryArtwork = record;

  if (!canUseIndexedDb()) return true;

  try {
    await runTransaction("readwrite", (store) => store.put(record, RECORD_KEY));
    return true;
  } catch (error) {
    console.error("Unable to persist pending customer artwork", error);
    return false;
  }
}

export async function getPendingCustomerArtwork() {
  let record = memoryArtwork;

  if (canUseIndexedDb()) {
    try {
      record = await runTransaction("readonly", (store) => store.get(RECORD_KEY));
    } catch (error) {
      console.error("Unable to restore pending customer artwork", error);
    }
  }

  if (!record) return null;
  if (Date.now() - Number(record.createdAt || 0) > MAX_AGE_MS) {
    await clearPendingCustomerArtwork();
    return null;
  }

  return record.file || null;
}

export async function clearPendingCustomerArtwork() {
  memoryArtwork = null;
  if (!canUseIndexedDb()) return true;

  try {
    await runTransaction("readwrite", (store) => store.delete(RECORD_KEY));
    return true;
  } catch (error) {
    console.error("Unable to clear pending customer artwork", error);
    return false;
  }
}
