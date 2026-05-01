const STORAGE_KEY = "teeCoStaffUsers";
const ACTIVE_STAFF_KEY = "teeCoActiveStaffUser";

export const STAFF_ROLES = ["Owner", "Manager", "Staff"];
export const STAFF_STATUSES = ["Active", "Inactive"];

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

function normalizeStaffUser(user) {
  return {
    id: user.id || `staff-${Date.now()}`,
    name: user.name || "New Staff User",
    role: STAFF_ROLES.includes(user.role) ? user.role : "Staff",
    pin: String(user.pin || "0000").replace(/\D/g, "").slice(0, 4).padStart(4, "0"),
    status: STAFF_STATUSES.includes(user.status) ? user.status : "Active",
    created_at: user.created_at || new Date().toISOString(),
    updated_at: user.updated_at || new Date().toISOString(),
  };
}

export function getStoredStaffUsers() {
  if (typeof window === "undefined") return DEFAULT_STAFF_USERS;

  try {
    const rawUsers = window.localStorage.getItem(STORAGE_KEY);
    if (rawUsers) {
      const parsedUsers = JSON.parse(rawUsers);
      if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
        return parsedUsers.map(normalizeStaffUser);
      }
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STAFF_USERS));
    return DEFAULT_STAFF_USERS;
  } catch (error) {
    console.error("Unable to read Tee & Co staff users", error);
    return DEFAULT_STAFF_USERS;
  }
}

export function saveStoredStaffUsers(users) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users.map(normalizeStaffUser)));
}

export function createStoredStaffUser(userInput) {
  const currentUsers = getStoredStaffUsers();
  const createdAt = new Date().toISOString();

  const user = normalizeStaffUser({
    id: `staff-${Date.now()}`,
    name: userInput.name,
    role: userInput.role,
    pin: userInput.pin,
    status: userInput.status || "Active",
    created_at: createdAt,
    updated_at: createdAt,
  });

  const nextUsers = [user, ...currentUsers];
  saveStoredStaffUsers(nextUsers);
  return user;
}

export function updateStoredStaffUser(userId, userInput) {
  const currentUsers = getStoredStaffUsers();
  let updatedUser = null;

  const nextUsers = currentUsers.map((user) => {
    if (user.id !== userId) return user;

    updatedUser = normalizeStaffUser({
      ...user,
      ...userInput,
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
  return updateStoredStaffUser(userId, { status: "Inactive" });
}

export function validateStaffPin(pin) {
  const cleanedPin = String(pin || "").trim();
  return getStoredStaffUsers().find(
    (user) => user.status !== "Inactive" && user.pin === cleanedPin
  );
}

export function setActiveStaffUser(user) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(ACTIVE_STAFF_KEY);
    return;
  }

  window.localStorage.setItem(
    ACTIVE_STAFF_KEY,
    JSON.stringify({ id: user.id, name: user.name, role: user.role })
  );
}

export function getActiveStaffUser() {
  if (typeof window === "undefined") return null;

  try {
    const rawUser = window.localStorage.getItem(ACTIVE_STAFF_KEY);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.error("Unable to read active Tee & Co staff user", error);
    return null;
  }
}

export function isActiveStaffOwner() {
  return getActiveStaffUser()?.role === "Owner";
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
