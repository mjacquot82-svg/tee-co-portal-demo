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
    id: "staff-owner-default",
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
  return Boolean(user) && (user.id === PROTECTED_OWNER_ID || user.role === "Owner");
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
    Boolean(user) &&
    user.id === PROTECTED_OWNER_ID &&
    user.role === "Owner" &&
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

  return nextInput;
}

function normalizeStaffUser(user) {
  const isProtectedOwner = isProtectedOwnerId(user.id);
  const fallbackRole = isProtectedOwner ? "Owner" : "Staff";

  return {
    id: user.id || `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: user.name || "New Staff User",
    role: isProtectedOwner
      ? "Owner"
      : user.role === "Owner"
        ? "Staff"
        : STAFF_ROLES.includes(user.role)
          ? user.role
          : fallbackRole,
    pin: formatStaffPin(user.pin || "0000"),
    status: isProtectedOwner
      ? "Active"
      : STAFF_STATUSES.includes(user.status)
        ? user.status
        : "Active",
    created_at: user.created_at || new Date().toISOString(),
    updated_at: user.updated_at || new Date().toISOString(),
  };
}

function buildPersistedStaffUsers(users) {
  const normalizedUsers = Array.isArray(users) ? users.map(normalizeStaffUser) : [];
  const nonProtectedUsers = normalizedUsers.filter((user) => user.id !== PROTECTED_OWNER_ID);
  const protectedOwner =
    normalizedUsers.find((user) => user.id === PROTECTED_OWNER_ID) || DEFAULT_STAFF_USERS[0];

  return [normalizeStaffUser(protectedOwner), ...nonProtectedUsers];
}

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

export function getStoredStaffUsers() {
  if (!hasBrowserStorage()) return DEFAULT_STAFF_USERS;

  try {
    const rawUsers = getRawStorageItem(STORAGE_KEY);
    if (rawUsers) {
      const parsedUsers = JSON.parse(rawUsers);
      if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
        const normalizedUsers = buildPersistedStaffUsers(parsedUsers);
        setJsonStorageItem(STORAGE_KEY, normalizedUsers);
        return normalizedUsers;
      }
    }

    setJsonStorageItem(STORAGE_KEY, DEFAULT_STAFF_USERS);
    return DEFAULT_STAFF_USERS;
  } catch (error) {
    console.error("Unable to read Tee & Co staff users", error);
    return DEFAULT_STAFF_USERS;
  }
}

export function getOwnerAdminAccount() {
  return getStoredStaffUsers().find((user) => isProtectedStaffUser(user)) || null;
}

export function getOperationalStaffUsers() {
  return getStoredStaffUsers().filter((user) => !isProtectedStaffUser(user));
}

export function getActiveOperationalStaffUsers() {
  return getOperationalStaffUsers().filter((user) => user.status !== "Inactive");
}

export function saveStoredStaffUsers(users) {
  if (!hasBrowserStorage()) return;
  const normalizedUsers = buildPersistedStaffUsers(users);
  setJsonStorageItem(STORAGE_KEY, normalizedUsers);
  emitStaffUsersUpdated();
}

export function createStoredStaffUser(userInput) {
  const currentUsers = getStoredStaffUsers();
  const createdAt = new Date().toISOString();
  const nextInput = prepareStaffUserInput(userInput, currentUsers);

  const user = normalizeStaffUser({
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextInput.name,
    role: nextInput.role,
    pin: nextInput.pin,
    status: nextInput.status || "Active",
    created_at: createdAt,
    updated_at: createdAt,
  });

  const nextUsers = [user, ...currentUsers];
  saveStoredStaffUsers(nextUsers);
  return user;
}

export function updateStoredStaffUser(userId, userInput) {
  const currentUsers = getStoredStaffUsers();
  const staffUser = currentUsers.find((user) => user.id === userId);
  const isProtectedOwner = isProtectedStaffUser(staffUser);
  const nextInput = prepareStaffUserInput(userInput, currentUsers, userId);
  let updatedUser = null;

  const nextUsers = currentUsers.map((user) => {
    if (user.id !== userId) return user;

    const nextRole = isProtectedOwner
      ? "Owner"
      : nextInput.role === undefined
        ? user.role
        : nextInput.role;
    const nextStatus = isProtectedOwner
      ? "Active"
      : nextInput.status === undefined
        ? user.status
        : nextInput.status;

    updatedUser = normalizeStaffUser({
      ...user,
      ...nextInput,
      role: nextRole,
      status: nextStatus,
      id: user.id,
      created_at: user.created_at,
      updated_at: new Date().toISOString(),
    });

    return updatedUser;
  });

  saveStoredStaffUsers(nextUsers);

  const activeStaff = getActiveStaffUser();
  if (activeStaff?.id === userId && updatedUser) {
    if (updatedUser.status === "Inactive") {
      setActiveStaffUser(null);
    } else {
      setActiveStaffUser(updatedUser);
    }
  }

  return updatedUser;
}

export function disableStoredStaffUser(userId) {
  const staffUser = getStoredStaffUsers().find((user) => user.id === userId);
  if (staffUser && isProtectedStaffUser(staffUser)) {
    return staffUser;
  }

  return updateStoredStaffUser(userId, { status: "Inactive" });
}

export function reactivateStoredStaffUser(userId) {
  return updateStoredStaffUser(userId, { status: "Active" });
}

export function validateStaffPin(pin) {
  const cleanedPin = cleanStaffPin(pin);
  return getStoredStaffUsers().find(
    (user) => user.status !== "Inactive" && user.pin === cleanedPin
  );
}

function resolveStoredStaffUser(user) {
  if (!user?.id) return null;

  return (
    getStoredStaffUsers().find((storedUser) => storedUser.id === user.id) || null
  );
}

export function setActiveStaffUser(user, options = {}) {
  if (!hasBrowserStorage()) return;

  if (!user) {
    const hadOwnerSession = shouldLogOwnerDiagnostics(getActiveStaffUser());
    const previousSession = getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" });
    clearLegacyActiveStaffPersistence();
    const clearedSession = clearSessionActiveStaffPersistence();
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
    return;
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
  if (operationalAuthUser?.id) {
    return operationalAuthUser;
  }

  if (!hasBrowserStorage()) return null;

  try {
    const sessionUser = getJsonStorageItem(ACTIVE_STAFF_KEY, null, { storage: "session" });
    clearLegacyActiveStaffPersistence();
    const parsedUser = sessionUser;

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
      clearActiveStaffSession();
      return null;
    }

    if (
      matchedUser.name !== parsedUser.name ||
      matchedUser.role !== parsedUser.role
    ) {
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
  } catch (error) {
    console.error("Unable to read active Tee & Co staff user", error);
    pushAuthDiagnostic("staff-session-hydrated", {
      hydrationResult: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function attemptStaffLogin({ staffUserId, pin, persistSession = true }) {
  const activeUsers = getStoredStaffUsers().filter((user) => user.status !== "Inactive");
  const selectedUser = activeUsers.find((user) => user.id === staffUserId) || null;
  const matchedUser = validateStaffPin(pin);
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

  if (isOwnerAttempt) {
    pushOwnerAuthDiagnostic("login-result", {
      selectedUserId: selectedUser.id,
      resolvedRole: sessionUser?.role || selectedUser.role,
      loginResult: sessionCreated ? "success" : "session-write-failed",
    });
  }

  if (!sessionCreated) {
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
  return getActiveStaffUser()?.role === "Owner";
}

export function isProtectedStaffUser(user) {
  return user?.id === PROTECTED_OWNER_ID || user?.role === "Owner";
}

export function generateUniqueStaffPin(excludedUserId) {
  const users = getStoredStaffUsers();

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

  function handleStorage(event) {
    if (!event || event.key === STORAGE_KEY) {
      listener(getStoredStaffUsers());
    }
  }

  function handleCustomEvent() {
    listener(getStoredStaffUsers());
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STAFF_USERS_UPDATED_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STAFF_USERS_UPDATED_EVENT, handleCustomEvent);
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
