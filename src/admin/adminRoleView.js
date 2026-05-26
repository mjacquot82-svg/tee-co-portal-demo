import { getActiveStaffUser } from "../lib/staffUsersStore";

const OPERATIONAL_ROLE_RANK = {
  Staff: 1,
  Manager: 2,
  Owner: 3,
};

export const MANAGEMENT_EXACT_PATHS = [
  "/admin/customers",
  "/admin/financial",
  "/admin/records/canceled",
  "/admin/sales",
  "/admin/staff-users",
  "/admin/quotes/archived",
];

export const MANAGEMENT_PATH_PREFIXES = [
  "/admin/customers/",
  "/admin/financial/",
  "/admin/garments",
  "/admin/products",
];

function normalizeRoutePathname(pathname = "") {
  return String(pathname || "").trim() || "/";
}

export function resolveOperationalRole(staffUser = getActiveStaffUser()) {
  if (!staffUser?.id) return "";

  const role = String(staffUser.role || "").trim();
  if (role === "Owner" || role === "Manager" || role === "Staff") {
    return role;
  }

  return "";
}

export function getAdminViewer(staffUser = getActiveStaffUser()) {
  return staffUser || null;
}

export function isAdminWorkspaceView(staffUser = getActiveStaffUser()) {
  const role = resolveOperationalRole(staffUser);
  return role === "Owner" || role === "Manager";
}

export function isOwnerView(staffUser = getActiveStaffUser()) {
  return resolveOperationalRole(staffUser) === "Owner";
}

export function isStaffWorkspaceView(staffUser = getActiveStaffUser()) {
  return resolveOperationalRole(staffUser) === "Staff";
}

export function hasOperationalSession(staffUser = getActiveStaffUser()) {
  return Boolean(staffUser?.id) && Boolean(resolveOperationalRole(staffUser));
}

function getOperationalRoleRank(staffUser) {
  return OPERATIONAL_ROLE_RANK[resolveOperationalRole(staffUser)] || 0;
}

export function getRouteAccessUser({
  authenticatedUser = null,
  activeStaffUser = getActiveStaffUser(),
} = {}) {
  const authenticatedRank = getOperationalRoleRank(authenticatedUser);
  const activeStaffRank = getOperationalRoleRank(activeStaffUser);

  if (authenticatedRank >= activeStaffRank && authenticatedRank > 0) {
    return authenticatedUser;
  }

  if (activeStaffRank > 0) {
    return activeStaffUser;
  }

  return authenticatedUser || activeStaffUser || null;
}

export function canAccessProtectedManagementRoute(
  pathname,
  authenticatedUser = getActiveStaffUser()
) {
  return (
    requiresProtectedManagementAccess(pathname) &&
    isAdminWorkspaceView(authenticatedUser)
  );
}

export function canManageArchivedQuotes(staffUser = getActiveStaffUser()) {
  return isAdminWorkspaceView(staffUser);
}

export function canManageCanceledOrders(staffUser = getActiveStaffUser()) {
  return isAdminWorkspaceView(staffUser);
}

export function matchesAssignedStaff(order, staffUser = getActiveStaffUser()) {
  const viewer = getAdminViewer(staffUser);
  if (!viewer) return false;

  if (viewer.id && order.assigned_to_staff_id) {
    return order.assigned_to_staff_id === viewer.id;
  }

  return Boolean(
    viewer.name &&
      order.assigned_to_staff_name &&
      order.assigned_to_staff_name === viewer.name
  );
}

export function getAssignedOrdersForStaff(orders = [], staffUser = getActiveStaffUser()) {
  return orders.filter((order) => matchesAssignedStaff(order, staffUser));
}

export function getOperationalOrdersForStaff(orders = []) {
  return orders.filter((order) => order.operational_visible !== false);
}

export function canAccessOwnerWorkspace(pathname, staffUser = getActiveStaffUser()) {
  if (!hasOperationalSession(staffUser)) return false;
  if (isAdminWorkspaceView(staffUser)) return true;
  if (!isStaffWorkspaceView(staffUser)) return false;

  return !requiresProtectedManagementAccess(pathname);
}

export function canAccessOperationalWorkspace(pathname, staffUser = getActiveStaffUser()) {
  return canAccessOwnerWorkspace(pathname, staffUser);
}

export function requiresProtectedManagementAccess(pathname = "") {
  const normalizedPathname = normalizeRoutePathname(pathname);

  return (
    MANAGEMENT_EXACT_PATHS.includes(normalizedPathname) ||
    MANAGEMENT_PATH_PREFIXES.some((prefix) => normalizedPathname.startsWith(prefix))
  );
}

export function classifyAdminRoute(pathname = "") {
  const normalizedPathname = normalizeRoutePathname(pathname);
  const matchedExactManagementRule = MANAGEMENT_EXACT_PATHS.includes(normalizedPathname)
    ? normalizedPathname
    : "";
  const matchedPrefixManagementRule =
    MANAGEMENT_PATH_PREFIXES.find((prefix) => normalizedPathname.startsWith(prefix)) || "";
  const requiresManagementAccess = Boolean(
    matchedExactManagementRule || matchedPrefixManagementRule
  );

  return {
    pathname: normalizedPathname,
    isAdminRoute: normalizedPathname.startsWith("/admin"),
    classification: requiresManagementAccess
      ? "protected-management"
      : normalizedPathname.startsWith("/admin")
        ? "operational"
        : "non-admin",
    requiresManagementAccess,
    matchedManagementRuleType: matchedExactManagementRule
      ? "exact"
      : matchedPrefixManagementRule
        ? "prefix"
        : "",
    matchedManagementRule: matchedExactManagementRule || matchedPrefixManagementRule || "",
  };
}
