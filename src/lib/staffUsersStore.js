const STORAGE_KEY = "teeCoStaffUsers";

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

export function getStoredStaffUsers() {
  if (typeof window === "undefined") return DEFAULT_STAFF_USERS;

  try {
    const rawUsers = window.localStorage.getItem(STORAGE_KEY);
    if (rawUsers) return JSON.parse(rawUsers);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STAFF_USERS));
    return DEFAULT_STAFF_USERS;
  } catch (error) {
    console.error("Unable to read Tee & Co staff users", error);
    return DEFAULT_STAFF_USERS;
  }
}

export function saveStoredStaffUsers(users) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function createStoredStaffUser(userInput) {
  const currentUsers = getStoredStaffUsers();
  const createdAt = new Date().toISOString();

  const user = {
    id: `staff-${Date.now()}`,
    name: userInput.name || "New Staff User",
    role: userInput.role || "Staff",
    pin: userInput.pin || "0000",
    status: userInput.status || "Active",
    created_at: createdAt,
    updated_at: createdAt,
  };

  const nextUsers = [user, ...currentUsers];
  saveStoredStaffUsers(nextUsers);
  return user;
}

export function validateStaffPin(pin) {
  const cleanedPin = String(pin || "").trim();
  return getStoredStaffUsers().find(
    (user) => user.status !== "Inactive" && user.pin === cleanedPin
  );
}
