import {
  getJsonStorageItem,
  getRawStorageItem,
  hasBrowserStorage,
  removeStorageItem,
  setJsonStorageItem,
  setRawStorageItem,
} from "./browserStorage";
import { pushAuthDiagnostic } from "./authDiagnostics";
import {
  getOperationalAuthUser,
  subscribeToOperationalAuth,
} from "./operationalAuthStore";
import { supabase } from "./supabase";

const STORAGE_KEY = "teeCoStaffUsers";
const ACTIVE_STAFF_KEY = "teeCoActiveStaffUser";
const STAFF_USERS_UPDATED_EVENT = "tee-co-staff-users-updated";
const ACTIVE_STAFF_UPDATED_EVENT = "tee-co-active-staff-updated";
const PROTECTED_OWNER_ID = "staff-owner-default";
const OWNER_AUTH_DIAGNOSTICS_KEY = "__TEE_CO_OWNER_AUTH_DIAGNOSTICS__";
const TEMP_OWNER_LOGIN_ID = "owner";
const TEMP_OWNER_PIN = "2468";

export const STAFF_ROLES = ["Owner", "Manager", "Staff"];
export const STAFF_STATUSES = ["Active", "Inactive"];
export const TEMP_OWNER_DEMO_CREDENTIALS = {
  loginId: TEMP_OWNER_LOGIN_ID,
  pin: TEMP_OWNER_PIN,
};

const DEFAULT_STAFF_USERS = [
  {
    id: PROTECTED_OWNER_ID,
    name: "Owner / Admin",
    role: "Owner",
    pin: "1234",
    status: "Active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function isProtectedOwnerId(userId) {
  return userId === PROTECTED_OWNER_ID;
}

function shouldLogOwnerDiagnostics(user) {
  return isProtectedStaffUser(user);
}

function normalizeOwnerLoginId(loginId) {
  return String(loginId ?? "").trim().toLowerCase();
}

function buildTemporaryOwnerSession() {
  return {
    id: PROTECTED_OWNER_ID,
    name: "Owner / Admin",
    role: "Owner",
    authMode: "temporary-owner",
    isTemporaryOwnerSession: true,
  };
}

function isTemporaryOwnerSession(user) {
  return (
    isProtectedStaffUser(user) &&
    user.authMode === "temporary-owner"
  );
}

function pushOwnerAuthDiagnostic(event, details = {}) {
  if (typeof window === "undefined") return;

  const nextEntry = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  const currentLog = Array.isArray(window[OWNER_AUTH_DIAGNOSTICS_KEY])
    ? window[OWNER_AUTH_DIAGNOSTICS_KEY]
    : [];
  const nextLog = [...currentLog.slice(-24), nextEntry];

  window[OWNER_AUTH_DIAGNOSTICS_KEY] = nextLog;
  console.info("[owner-auth]", nextEntry);
}

function cleanStaffPin(pin) {
  return String(pin ?? "").replace(/\D/g, "").slice(0, 4);
}

function formatStaffPin(pin) {
  return cleanStaffPin(pin).padStart(4, "0");
}

function validateStaffUserName(name) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) {
    throw new Error("Name is required.");
  }

  return trimmedName;
}

function normalizeStaffRole(role, fallbackRole = "Staff") {
  return STAFF_ROLES.includes(role) ? role : fallbackRole;
}

function normalizeStaffStatus(status) {
  return STAFF_STATUSES.includes(status) ? status : "Active";
}

function normalizeStaffUser(user) {
  const isProtectedOwner = isProtectedOwnerId(user?.id);
  const fallbackRole = isProtectedOwner ? "Owner" : "Staff";
  const normalizedRole = isProtectedOwner
    ? "Owner"
    : normalizeStaffRole(user?.role, fallbackRole);
  const normalizedStatus = isProtectedOwner
    ? "Active"
    : normalizeStaffStatus(user?.status);
  const createdAt = user?.created_at || new Date().toISOString();

  return {
    id: user?.id || `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: user?.name || "New Staff User",
    role: normalizedRole,
    pin: formatStaffPin(user?.pin || "0000"),
    status: normalizedStatus,
    created_at: createdAt,
    updated_at: user?.updated_at || createdAt,
  };
}

function buildPersistedStaffUsers(users, options = {}) {
  const { includeFallbackOwner = true } = options;
  const normalizedUsers = Array.isArray(users) ? users.map(normalizeStaffUser) : [];

  if (!includeFallbackOwner) {
    return normalizedUsers;
  }

  const protectedOwner =
    normalizedUsers.find((user) => user.id === PROTECTED_OWNER_ID) || DEFAULT_STAFF_USERS[0];
  const nonProtectedUsers = normalizedUsers.filter((user) => user.id !== PROTECTED_OWNER_ID);

  return [normalizeStaffUser(protectedOwner), ...nonProtectedUsers];
}

function readLocalFallbackStaffUsers() {
  if (!hasBrowserStorage()) {
    return buildPersistedStaffUsers(DEFAULT_STAFF_USERS);
  }

  try {
    const rawUsers = getRawStorageItem(STORAGE_KEY);
    if (rawUsers) {
      const parsedUsers = JSON.parse(rawUsers);
      if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
        return buildPersistedStaffUsers(parsedUsers);
      }
    }
  } catch (error) {
    console.error("[staff-users] Unable to read local fallback staff users", error);
  }

  return buildPersistedStaffUsers(DEFAULT_STAFF_USERS);
}

let staffUsersCache = readLocalFallbackStaffUsers();
let staffUsersHydrationPromise = null;
let staffUsersHydratedFromSupabase = false;
let activeStaffUploadCredential = null;

function emitStaffUsersUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAFF_USERS_UPDATED_EVENT));
}

function emitActiveStaffUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_STAFF_UPDATED_EVENT));
}

function clearLegacyActiveStaffPersistence() {
  removeStorageItem(ACTIVE_STAFF_KEY);
}

function clearSessionActiveStaffPersistence() {
  return removeStorageItem(ACTIVE_STAFF_KEY, { storage: "session" });
}

function clearSessionUploadCredentialPersistence() {
  activeStaffUploadCredential = null;
}

function setActiveStaffUploadCredential(user, pin) {
  if (!user?.id) return false;

  const cleanedPin = cleanStaffPin(pin);
  if (cleanedPin.length !== 4) return false;

  activeStaffUploadCredential = {
    staffUserId: user.id,
    pin: cleanedPin,
  };

  return true;
}

function persistStaffUsersCache(users) {
  const normalizedUsers = buildPersistedStaffUsers(users);
  staffUsersCache = normalizedUsers;

  if (hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, normalizedUsers);
  }

  emitStaffUsersUpdated();
  return normalizedUsers;
}

function setStaffUsersCacheFromSupabase(users) {
  const normalizedUsers = buildPersistedStaffUsers(users, {
    includeFallbackOwner: Array.isArray(users) ? users.length === 0 : true,
  });

  staffUsersCache = normalizedUsers;
  staffUsersHydratedFromSupabase = true;

  if (hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, normalizedUsers);
  }

  emitStaffUsersUpdated();
  return normalizedUsers;
}

function getCachedStaffUsers() {
  return Array.isArray(staffUsersCache) && staffUsersCache.length > 0
    ? staffUsersCache
    : buildPersistedStaffUsers(DEFAULT_STAFF_USERS);
}

function shouldUseSupabase() {
  return Boolean(supabase?.from);
}

function mapSupabaseRowToStaffUser(row) {
  const normalizedStatus =
    typeof row?.active === "boolean"
      ? row.active
        ? "Active"
        : "Inactive"
      : normalizeStaffStatus(row?.status);

  return normalizeStaffUser({
    id: row?.id,
    name: row?.name,
    pin: row?.pin,
    role: row?.role,
    status: normalizedStatus,
    created_at: row?.created_at,
    updated_at: row?.updated_at || row?.created_at,
  });
}

function mapStaffUserToSupabaseInsertWithActive(user) {
  return {
    name: user.name,
    pin: user.pin,
    role: user.role,
    active: user.status !== "Inactive",
  };
}

function mapStaffUserToSupabaseInsertWithStatus(user) {
  return {
    name: user.name,
    pin: user.pin,
    role: user.role,
    status: user.status,
  };
}

function mapStaffUserUpdatesToSupabaseWithActive(updates) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    payload.name = updates.name;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "pin")) {
    payload.pin = updates.pin;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "role")) {
    payload.role = updates.role;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "status")) {
    payload.active = updates.status !== "Inactive";
  }

  return payload;
}

function mapStaffUserUpdatesToSupabaseWithStatus(updates) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    payload.name = updates.name;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "pin")) {
    payload.pin = updates.pin;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "role")) {
    payload.role = updates.role;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "status")) {
    payload.status = updates.status;
  }

  return payload;
}

async function fetchStaffUsersFromSupabase() {
  if (!shouldUseSupabase()) {
    throw new Error("Supabase client is not configured for staff users.");
  }

  const { data, error } = await supabase
    .from("staff_users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(mapSupabaseRowToStaffUser) : [];
}

function isSupabaseMissingColumnError(error, columnName) {
  const message = String(error?.message || error?.details || error || "").toLowerCase();
  return message.includes(`column "${String(columnName).toLowerCase()}"`) ||
    message.includes(`'${String(columnName).toLowerCase()}'`) ||
    message.includes(`${String(columnName).toLowerCase()} does not exist`);
}

async function runStaffUsersInsert(user) {
  const attempts = [
    {
      mode: "active",
      payload: mapStaffUserToSupabaseInsertWithActive(user),
    },
    {
      mode: "status",
      payload: mapStaffUserToSupabaseInsertWithStatus(user),
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      console.info("[staff-users] Supabase create attempt", {
        mode: attempt.mode,
        userName: user.name,
        role: user.role,
      });

      const { data, error } = await supabase
        .from("staff_users")
        .insert([attempt.payload]);

      if (error) {
        throw error;
      }

      console.info("[staff-users] Supabase insert returned", {
        mode: attempt.mode,
        dataShape: Array.isArray(data) ? "array" : typeof data,
        rowCount: Array.isArray(data) ? data.length : undefined,
        hasData: data !== null && data !== undefined,
      });

      return {
        data,
        mode: attempt.mode,
      };
    } catch (error) {
      lastError = error;
      console.error("[staff-users] Supabase create attempt failed", {
        mode: attempt.mode,
        message: error?.message || String(error),
        details: error?.details || "",
        hint: error?.hint || "",
        code: error?.code || "",
      });

      const shouldRetry =
        (attempt.mode === "active" && isSupabaseMissingColumnError(error, "active")) ||
        (attempt.mode === "status" && isSupabaseMissingColumnError(error, "status"));

      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Supabase create failed.");
}

async function runStaffUsersUpdate(userId, updates) {
  const attempts = [
    {
      mode: "active",
      payload: mapStaffUserUpdatesToSupabaseWithActive(updates),
    },
    {
      mode: "status",
      payload: mapStaffUserUpdatesToSupabaseWithStatus(updates),
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      console.info("[staff-users] Supabase update attempt", {
        mode: attempt.mode,
        userId,
        fields: Object.keys(attempt.payload),
      });

      const { data, error } = await supabase
        .from("staff_users")
        .update(attempt.payload)
        .eq("id", userId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return {
        row: data,
        mode: attempt.mode,
      };
    } catch (error) {
      lastError = error;
      console.error("[staff-users] Supabase update attempt failed", {
        mode: attempt.mode,
        userId,
        message: error?.message || String(error),
        details: error?.details || "",
        hint: error?.hint || "",
        code: error?.code || "",
      });

      const shouldRetry =
        (attempt.mode === "active" && isSupabaseMissingColumnError(error, "active")) ||
        (attempt.mode === "status" && isSupabaseMissingColumnError(error, "status"));

      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Supabase update failed.");
}

function validateUniqueStaffPin(pin, users, excludedUserId) {
  const cleanedPin = cleanStaffPin(pin);

  if (cleanedPin.length !== 4) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const hasDuplicatePin = users.some(
    (user) => user.id !== excludedUserId && cleanStaffPin(user.pin) === cleanedPin
  );

  if (hasDuplicatePin) {
    throw new Error("PIN is already assigned to another staff account.");
  }

  return cleanedPin;
}

function prepareStaffUserInput(userInput, users, excludedUserId) {
  const nextInput = { ...userInput };

  if (Object.prototype.hasOwnProperty.call(nextInput, "name")) {
    nextInput.name = validateStaffUserName(nextInput.name);
  }

  if (Object.prototype.hasOwnProperty.call(nextInput, "pin")) {
    nextInput.pin = validateUniqueStaffPin(nextInput.pin, users, excludedUserId);
  }

  if (Object.prototype.hasOwnProperty.call(nextInput, "role")) {
    nextInput.role = normalizeStaffRole(nextInput.role);
  }

  if (Object.prototype.hasOwnProperty.call(nextInput, "status")) {
    nextInput.status = normalizeStaffStatus(nextInput.status);
  }

  return nextInput;
}

function resolveStoredStaffUser(user) {
  if (!user?.id) return null;

  return getCachedStaffUsers().find((storedUser) => storedUser.id === user.id) || null;
}

function getStoredActiveStaffUserSnapshot() {
  if (!hasBrowserStorage()) return null;

  try {
    const sessionUser = getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" });
    clearLegacyActiveStaffPersistence();

    if (!sessionUser?.id) {
      return null;
    }

    if (isTemporaryOwnerSession(sessionUser)) {
      return buildTemporaryOwnerSession();
    }

    return sessionUser;
  } catch (error) {
    console.error("[staff-users] Unable to read active Tee & Co staff user", error);
    return null;
  }
}

function resolveHydratedActiveStaffUser() {
  const parsedUser = getStoredActiveStaffUserSnapshot();

  if (!parsedUser?.id) {
    pushAuthDiagnostic("staff-session-hydrated", {
      hydrationResult: "empty",
    });
    return null;
  }

  if (isTemporaryOwnerSession(parsedUser)) {
    const hydratedUser = buildTemporaryOwnerSession();

    pushAuthDiagnostic("staff-session-hydrated", {
      userId: hydratedUser.id,
      resolvedRole: hydratedUser.role,
      hydrationResult: "restored-temporary-owner",
    });
    pushOwnerAuthDiagnostic("session-hydrated", {
      userId: hydratedUser.id,
      resolvedRole: hydratedUser.role,
      hydrationResult: "restored-temporary-owner",
    });

    return hydratedUser;
  }

  const matchedUser = resolveStoredStaffUser(parsedUser);

  if (!matchedUser || matchedUser.status === "Inactive") {
    pushAuthDiagnostic("staff-session-hydrated", {
      userId: parsedUser.id,
      resolvedRole: parsedUser.role || "",
      hydrationResult: "cleared-missing-or-inactive",
    });
    if (shouldLogOwnerDiagnostics(parsedUser)) {
      pushOwnerAuthDiagnostic("session-hydrated", {
        userId: parsedUser.id,
        resolvedRole: parsedUser.role || "",
        hydrationResult: "cleared-missing-or-inactive",
      });
    }
    clearActiveStaffSession({ reason: "session-hydration-missing-or-inactive" });
    return null;
  }

  if (matchedUser.name !== parsedUser.name || matchedUser.role !== parsedUser.role) {
    setActiveStaffUser(matchedUser);
  }

  const hydratedUser = {
    id: matchedUser.id,
    name: matchedUser.name,
    role: matchedUser.role,
  };

  pushAuthDiagnostic("staff-session-hydrated", {
    userId: hydratedUser.id,
    resolvedRole: hydratedUser.role,
    hydrationResult: "restored",
  });

  if (shouldLogOwnerDiagnostics(hydratedUser)) {
    pushOwnerAuthDiagnostic("session-hydrated", {
      userId: hydratedUser.id,
      resolvedRole: hydratedUser.role,
      hydrationResult: "restored",
    });
  }

  return hydratedUser;
}

export async function ensureStaffUsersHydrated(options = {}) {
  const { force = false } = options;

  if (!force && staffUsersHydratedFromSupabase) {
    return getCachedStaffUsers();
  }

  if (!force && staffUsersHydrationPromise) {
    return staffUsersHydrationPromise;
  }

  staffUsersHydrationPromise = (async () => {
    try {
      const remoteUsers = await fetchStaffUsersFromSupabase();
      console.info("[staff-users] Hydrated staff users from Supabase", {
        count: remoteUsers.length,
      });
      return setStaffUsersCacheFromSupabase(remoteUsers);
    } catch (error) {
      console.error("[staff-users] Supabase staff hydration failed. Using local fallback.", error);
      return persistStaffUsersCache(getCachedStaffUsers());
    } finally {
      staffUsersHydrationPromise = null;
    }
  })();

  return staffUsersHydrationPromise;
}

export async function hydrateActiveStaffUser() {
  try {
    await ensureStaffUsersHydrated();
  } catch (error) {
    console.error("[staff-users] Active staff hydration could not refresh staff users", error);
  }

  try {
    return resolveHydratedActiveStaffUser();
  } catch (error) {
    console.error("[staff-users] Active staff hydration failed", error);
    pushAuthDiagnostic("staff-session-hydrated", {
      hydrationResult: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getStoredStaffUsers() {
  return ensureStaffUsersHydrated();
}

export function getOwnerAdminAccount() {
  void ensureStaffUsersHydrated();
  return getCachedStaffUsers().find((user) => isProtectedStaffUser(user)) || null;
}

export function getOperationalStaffUsers() {
  void ensureStaffUsersHydrated();
  return getCachedStaffUsers();
}

export function getActiveOperationalStaffUsers() {
  return getOperationalStaffUsers().filter((user) => user.status !== "Inactive");
}

export function getPinAccessibleStaffUsers() {
  return getActiveOperationalStaffUsers();
}

export function saveStoredStaffUsers(users) {
  return persistStaffUsersCache(users);
}

export async function createStoredStaffUser(userInput) {
  const currentUsers = await getStoredStaffUsers();
  const createdAt = new Date().toISOString();
  const nextInput = prepareStaffUserInput(userInput, currentUsers);

  const fallbackUser = normalizeStaffUser({
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextInput.name,
    role: nextInput.role,
    pin: nextInput.pin,
    status: nextInput.status || "Active",
    created_at: createdAt,
    updated_at: createdAt,
  });

  if (!shouldUseSupabase()) {
    console.warn("[staff-users] Supabase unavailable during create. Falling back to local cache.", {
      reason: "supabase-client-unavailable",
      userName: fallbackUser.name,
    });
    saveStoredStaffUsers([fallbackUser, ...currentUsers]);
    return fallbackUser;
  }

  try {
    const { data, mode } = await runStaffUsersInsert(fallbackUser);
    console.info("[staff-users] Supabase create succeeded", {
      mode,
      userName: fallbackUser.name,
      returnedDataShape: Array.isArray(data) ? "array" : typeof data,
      returnedRowCount: Array.isArray(data) ? data.length : undefined,
    });

    const refreshedUsers = await ensureStaffUsersHydrated({ force: true });
    const resolvedCreatedUser =
      refreshedUsers.find(
        (user) =>
          user.name === fallbackUser.name &&
          user.pin === fallbackUser.pin &&
          user.role === fallbackUser.role
      ) || null;

    if (resolvedCreatedUser) {
      console.info("[staff-users] Supabase create resolved from refreshed hydration", {
        userId: resolvedCreatedUser.id,
        userName: resolvedCreatedUser.name,
      });
      return resolvedCreatedUser;
    }

    console.warn("[staff-users] Supabase create could not be resolved from refreshed hydration. Falling back to local cache.", {
      reason: "created-user-not-found-after-rehydrate",
      userName: fallbackUser.name,
    });
    saveStoredStaffUsers([fallbackUser, ...currentUsers]);
    return fallbackUser;
  } catch (error) {
    console.error("[staff-users] Supabase create failed. Falling back to local cache.", {
      message: error?.message || String(error),
      details: error?.details || "",
      hint: error?.hint || "",
      code: error?.code || "",
      reason: "insert-threw-or-rehydrate-failed",
      userName: fallbackUser.name,
    });
    saveStoredStaffUsers([fallbackUser, ...currentUsers]);
    return fallbackUser;
  }
}

export async function updateStoredStaffUser(userId, userInput) {
  const currentUsers = await getStoredStaffUsers();
  const staffUser = currentUsers.find((user) => user.id === userId);

  if (!staffUser) {
    throw new Error("Staff user not found.");
  }

  const isProtectedOwner = isProtectedStaffUser(staffUser);
  const nextInput = prepareStaffUserInput(userInput, currentUsers, userId);
  const fallbackUpdatedUser = normalizeStaffUser({
    ...staffUser,
    ...nextInput,
    role: isProtectedOwner
      ? "Owner"
      : nextInput.role === undefined
        ? staffUser.role
        : nextInput.role,
    status: isProtectedOwner
      ? "Active"
      : nextInput.status === undefined
        ? staffUser.status
        : nextInput.status,
    id: staffUser.id,
    created_at: staffUser.created_at,
    updated_at: new Date().toISOString(),
  });

  const syncUpdatedUserLocally = (updatedUser, usersToPersist = currentUsers) => {
    saveStoredStaffUsers(
      usersToPersist.map((user) => (user.id === userId ? updatedUser : user))
    );

    const activeStaff = getActiveStaffUser();
    if (activeStaff?.id === userId) {
      if (updatedUser.status === "Inactive") {
        setActiveStaffUser(null);
      } else {
        setActiveStaffUser(updatedUser);
      }
    }

    return updatedUser;
  };

  if (!shouldUseSupabase()) {
    console.warn("[staff-users] Supabase unavailable during update. Falling back to local cache.", {
      userId,
    });
    return syncUpdatedUserLocally(fallbackUpdatedUser);
  }

  try {
    const { row, mode } = await runStaffUsersUpdate(userId, fallbackUpdatedUser);
    const updatedUser = mapSupabaseRowToStaffUser(row);
    console.info("[staff-users] Supabase update succeeded", {
      mode,
      userId: updatedUser.id,
      userName: updatedUser.name,
      status: updatedUser.status,
    });
    const refreshedUsers = await ensureStaffUsersHydrated({ force: true });
    const refreshedUpdatedUser =
      refreshedUsers.find((user) => user.id === updatedUser.id) || updatedUser;
    return syncUpdatedUserLocally(refreshedUpdatedUser, refreshedUsers);
  } catch (error) {
    console.error("[staff-users] Supabase update failed. Falling back to local cache.", {
      userId,
      message: error?.message || String(error),
      details: error?.details || "",
      hint: error?.hint || "",
      code: error?.code || "",
    });
    return syncUpdatedUserLocally(fallbackUpdatedUser);
  }
}

export async function disableStoredStaffUser(userId) {
  const staffUser = getOperationalStaffUsers().find((user) => user.id === userId);
  if (staffUser && isProtectedStaffUser(staffUser)) {
    return staffUser;
  }

  return updateStoredStaffUser(userId, { status: "Inactive" });
}

export async function reactivateStoredStaffUser(userId) {
  return updateStoredStaffUser(userId, { status: "Active" });
}

export async function validateStaffPin(pin) {
  const cleanedPin = cleanStaffPin(pin);
  const users = await getStoredStaffUsers();
  return users.find((user) => user.status !== "Inactive" && user.pin === cleanedPin) || null;
}

export function setActiveStaffUser(user, options = {}) {
  if (!hasBrowserStorage()) return null;

  if (!user) {
    const hadOwnerSession = shouldLogOwnerDiagnostics(getActiveStaffUser());
    const previousSession = getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" });
    clearLegacyActiveStaffPersistence();
    const clearedSession = clearSessionActiveStaffPersistence();
    clearSessionUploadCredentialPersistence();
    emitActiveStaffUpdated();
    pushAuthDiagnostic("staff-session-cleared", {
      reason: options.reason || "manual-clear",
      clearedSession,
      hadSession: Boolean(previousSession),
      previousStaffUserId: previousSession?.id || "",
      previousStaffRole: previousSession?.role || "",
    });
    if (hadOwnerSession) {
      pushOwnerAuthDiagnostic("logout-cleanup", {
        clearedSession,
        sessionAfterClear: getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" }),
      });
    }
    return null;
  }

  const resolvedUser = isTemporaryOwnerSession(user)
    ? buildTemporaryOwnerSession()
    : resolveStoredStaffUser(user) || normalizeStaffUser(user);
  const nextActiveUser = {
    id: resolvedUser.id,
    name: resolvedUser.name,
    role: resolvedUser.role,
    ...(isTemporaryOwnerSession(resolvedUser)
      ? {
          authMode: resolvedUser.authMode,
          isTemporaryOwnerSession: true,
        }
      : {}),
  };

  clearLegacyActiveStaffPersistence();
  const sessionCreated = setRawStorageItem(
    ACTIVE_STAFF_KEY,
    JSON.stringify(nextActiveUser),
    { storage: "session" }
  );
  emitActiveStaffUpdated();
  pushAuthDiagnostic("staff-session-created", {
    userId: resolvedUser.id,
    resolvedRole: resolvedUser.role,
    displayName: resolvedUser.name,
  });
  if (shouldLogOwnerDiagnostics(resolvedUser)) {
    pushOwnerAuthDiagnostic("session-created", {
      userId: resolvedUser.id,
      resolvedRole: resolvedUser.role,
      sessionCreated,
      persistedSession: getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" }),
    });
  }

  return nextActiveUser;
}

export function clearActiveStaffSession(options = {}) {
  setActiveStaffUser(null, options);
}

export function getActiveStaffUser() {
  const operationalAuthUser = getOperationalAuthUser();
  const storedActiveStaffUser = resolveHydratedActiveStaffUser();

  if (storedActiveStaffUser?.id) {
    return storedActiveStaffUser;
  }

  if (operationalAuthUser?.id) {
    return operationalAuthUser;
  }

  return null;
}

export function getActiveStaffUploadCredential() {
  try {
    if (
      !activeStaffUploadCredential?.staffUserId ||
      cleanStaffPin(activeStaffUploadCredential.pin).length !== 4
    ) {
      return null;
    }

    const activeStaffUser = getActiveStaffUser();
    if (!activeStaffUser?.id || activeStaffUser.id !== activeStaffUploadCredential.staffUserId) {
      return null;
    }

    return {
      staffUserId: activeStaffUploadCredential.staffUserId,
      pin: cleanStaffPin(activeStaffUploadCredential.pin),
    };
  } catch (error) {
    console.error("[staff-users] Unable to read active staff upload credential", error);
    return null;
  }
}

export async function attemptStaffLogin({ staffUserId, pin, persistSession = true }) {
  const users = await getStoredStaffUsers();
  const activeUsers = users.filter((user) => user.status !== "Inactive");
  const selectedUser = activeUsers.find((user) => user.id === staffUserId) || null;
  const matchedUser = await validateStaffPin(pin);
  const isOwnerAttempt = isProtectedOwnerId(staffUserId) || shouldLogOwnerDiagnostics(matchedUser);

  if (isOwnerAttempt) {
    pushOwnerAuthDiagnostic("login-attempt", {
      selectedUserId: staffUserId || "",
      pinLength: cleanStaffPin(pin).length,
      matchedUserId: matchedUser?.id || "",
      matchedRole: matchedUser?.role || "",
    });
  }

  if (!selectedUser || !matchedUser || matchedUser.id !== selectedUser.id) {
    console.warn("[staff-users] Staff PIN login failed", {
      selectedUserId: staffUserId || "",
      matchedUserId: matchedUser?.id || "",
    });

    if (isOwnerAttempt) {
      pushOwnerAuthDiagnostic("login-result", {
        selectedUserId: staffUserId || "",
        resolvedRole: selectedUser?.role || matchedUser?.role || "",
        loginResult: "credential-mismatch",
      });
    }

    return {
      ok: false,
      code: "PIN_MISMATCH",
      message: "That PIN does not match the selected staff member.",
    };
  }

  const sessionUser = persistSession ? setActiveStaffUser(selectedUser) : selectedUser;
  const sessionCreated = persistSession ? Boolean(sessionUser?.id) : true;
  if (sessionCreated && persistSession) {
    setActiveStaffUploadCredential(selectedUser, pin);
  }

  if (isOwnerAttempt) {
    pushOwnerAuthDiagnostic("login-result", {
      selectedUserId: selectedUser.id,
      resolvedRole: sessionUser?.role || selectedUser.role,
      loginResult: sessionCreated ? "success" : "session-write-failed",
    });
  }

  if (!sessionCreated) {
    console.error("[staff-users] Staff PIN login failed to persist session", {
      selectedUserId: selectedUser.id,
    });
    return {
      ok: false,
      code: "SESSION_WRITE_FAILED",
      message: "Unable to start the selected staff session.",
    };
  }

  return {
    ok: true,
    user: sessionUser,
  };
}

export function attemptTemporaryOwnerLogin({
  loginId,
  pin,
  persistSession = true,
} = {}) {
  const normalizedLoginId = normalizeOwnerLoginId(loginId);
  const normalizedPin = cleanStaffPin(pin);
  const ownerUser = buildTemporaryOwnerSession();
  const credentialsMatch =
    normalizedLoginId === TEMP_OWNER_LOGIN_ID && normalizedPin === TEMP_OWNER_PIN;

  pushOwnerAuthDiagnostic("temporary-login-attempt", {
    selectedUserId: ownerUser.id,
    loginId: normalizedLoginId,
    pinLength: normalizedPin.length,
  });

  if (!credentialsMatch) {
    pushOwnerAuthDiagnostic("temporary-login-result", {
      selectedUserId: ownerUser.id,
      resolvedRole: ownerUser.role,
      loginResult: "credential-mismatch",
    });

    return {
      ok: false,
      code: "PIN_MISMATCH",
      message: "That owner login or PIN is incorrect.",
    };
  }

  const sessionUser = persistSession ? setActiveStaffUser(ownerUser) : ownerUser;
  const sessionCreated = persistSession ? Boolean(sessionUser?.id) : true;

  pushOwnerAuthDiagnostic("temporary-login-result", {
    selectedUserId: ownerUser.id,
    resolvedRole: ownerUser.role,
    loginResult: sessionCreated ? "success" : "session-write-failed",
  });

  if (!sessionCreated) {
    return {
      ok: false,
      code: "SESSION_WRITE_FAILED",
      message: "Unable to start the owner session.",
    };
  }

  return {
    ok: true,
    user: sessionUser,
  };
}

export function isActiveStaffOwner() {
  return isProtectedStaffUser(getActiveStaffUser());
}

export function isProtectedStaffUser(user) {
  return user?.id === PROTECTED_OWNER_ID || user?.role === "Owner";
}

export function generateUniqueStaffPin(excludedUserId) {
  const users = getOperationalStaffUsers();

  for (let pinNumber = 0; pinNumber <= 9999; pinNumber += 1) {
    const candidatePin = formatStaffPin(pinNumber);
    const hasDuplicatePin = users.some(
      (user) => user.id !== excludedUserId && user.pin === candidatePin
    );

    if (!hasDuplicatePin) {
      return candidatePin;
    }
  }

  throw new Error("No available PINs remaining.");
}

export function subscribeToStaffUsers(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function notifyStaffUsers() {
    listener(getOperationalStaffUsers());
  }

  function handleStorage(event) {
    if (!event || event.key === STORAGE_KEY) {
      notifyStaffUsers();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STAFF_USERS_UPDATED_EVENT, notifyStaffUsers);

  notifyStaffUsers();
  void ensureStaffUsersHydrated();

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STAFF_USERS_UPDATED_EVENT, notifyStaffUsers);
  };
}

export function subscribeToActiveStaffUser(listener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function notifyActiveStaff() {
    listener(getActiveStaffUser());
  }

  function handleStorage(event) {
    if (!event || !event.key || event.key === ACTIVE_STAFF_KEY) {
      notifyActiveStaff();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(ACTIVE_STAFF_UPDATED_EVENT, notifyActiveStaff);
  const unsubscribeOperationalAuth = subscribeToOperationalAuth(() => {
    notifyActiveStaff();
  });

  notifyActiveStaff();
  void hydrateActiveStaffUser().then((nextUser) => {
    listener(nextUser);
  });

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ACTIVE_STAFF_UPDATED_EVENT, notifyActiveStaff);
    unsubscribeOperationalAuth();
  };
}

export function buildStaffAuditFields(prefix = "created") {
  const activeStaff = getActiveStaffUser();

  if (!activeStaff) {
    return {
      [`${prefix}_by_staff_id`]: "",
      [`${prefix}_by_staff_name`]: "Unknown Staff",
      [`${prefix}_by_staff_role`]: "",
    };
  }

  return {
    [`${prefix}_by_staff_id`]: activeStaff.id || "",
    [`${prefix}_by_staff_name`]: activeStaff.name || "Unknown Staff",
    [`${prefix}_by_staff_role`]: activeStaff.role || "",
  };
}
