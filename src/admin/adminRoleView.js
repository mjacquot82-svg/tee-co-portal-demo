import {
  OPERATIONAL_ROLES,
  PERMISSIONS,
  getPermissionListForUser,
  hasPermission,
  normalizeOperationalRole as normalizePermissionRole,
} from "../lib/permissions";
import { getActiveStaffUser } from "../lib/staffUsersStore";

const OPERATIONAL_ROLE_RANK = {
  [OPERATIONAL_ROLES.staff]: 1,
  [OPERATIONAL_ROLES.manager]: 2,
  [OPERATIONAL_ROLES.owner]: 3,
};

export const MANAGEMENT_EXACT_PATHS = [
  "/admin/customers",
  "/admin/financial",
  "/admin/records/canceled",
  "/admin/sales",
  "/admin/staff-users",
  "/admin/settings/notifications",
  "/admin/quotes/archived",
  "/admin/settings/notifications",
];

export const MANAGEMENT_PATH_PREFIXES = [
  "/admin/customers/",
  "/admin/financial/",
  "/admin/garments",
  "/admin/products",
];

const ADMIN_ROUTE_PERMISSION_RULES = [
  {
    type: "exact",
    value: "/admin",
    permissions: [PERMISSIONS.productionManage, PERMISSIONS.quoteManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/quotes",
    permissions: [PERMISSIONS.quoteManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/quotes/new",
    permissions: [PERMISSIONS.quoteManage],
    classification: "operational",
  },
  {
    type: "prefix",
    value: "/admin/quotes/",
    permissions: [PERMISSIONS.quoteManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/orders",
    permissions: [PERMISSIONS.orderManage, PERMISSIONS.productionManage],
    classification: "operational",
  },
  {
    type: "prefix",
    value: "/admin/orders/",
    permissions: [PERMISSIONS.orderManage, PERMISSIONS.productionManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/assignments",
    permissions: [PERMISSIONS.assignmentManage, PERMISSIONS.productionManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/sales/new",
    permissions: [PERMISSIONS.orderManage],
    classification: "operational",
  },
  {
    type: "prefix",
    value: "/admin/sales/receipt/",
    permissions: [PERMISSIONS.orderManage],
    classification: "operational",
  },
  {
    type: "exact",
    value: "/admin/customers",
    permissions: [PERMISSIONS.customerEdit],
    classification: "protected-management",
  },
  {
    type: "prefix",
    value: "/admin/customers/",
    permissions: [PERMISSIONS.customerEdit],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/financial",
    permissions: [PERMISSIONS.depositManage],
    classification: "protected-management",
  },
  {
    type: "prefix",
    value: "/admin/financial/",
    permissions: [PERMISSIONS.depositManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/records/canceled",
    permissions: [PERMISSIONS.orderCancel],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/sales",
    permissions: [PERMISSIONS.depositManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/staff-users",
    permissions: [PERMISSIONS.staffManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/settings/notifications",
    permissions: [PERMISSIONS.settingsManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/settings/order-export",
    permissions: [PERMISSIONS.settingsManage],
    classification: "protected-management",
    ownerOnly: true,
  },
  {
    type: "exact",
    value: "/admin/quotes/archived",
    permissions: [PERMISSIONS.quoteArchiveManage],
    classification: "protected-management",
  },
  {
    type: "prefix",
    value: "/admin/garments",
    permissions: [PERMISSIONS.catalogManage],
    classification: "protected-management",
  },
  {
    type: "prefix",
    value: "/admin/products",
    permissions: [PERMISSIONS.catalogManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/settings/notifications",
    permissions: [PERMISSIONS.settingsManage],
    classification: "protected-management",
  },
  {
    type: "exact",
    value: "/admin/notifications",
    permissions: [PERMISSIONS.productionManage, PERMISSIONS.orderManage, PERMISSIONS.assignmentManage],
    classification: "operational",
  },
];

function normalizeRoutePathname(pathname = "") {
  return String(pathname || "").trim() || "/";
}

export function resolveOperationalRole(staffUser = getActiveStaffUser()) {
  if (!staffUser?.id) return "";
  return normalizePermissionRole(staffUser.role);
}

export function getAdminViewer(staffUser = getActiveStaffUser()) {
  if (!staffUser) return null;

  return {
    ...staffUser,
    role: resolveOperationalRole(staffUser),
    permissions: getPermissionListForUser(staffUser),
  };
}

export function isAdminWorkspaceView(staffUser = getActiveStaffUser()) {
  return hasAnyOperationalManagementPermission(staffUser);
}

export function isOwnerView(staffUser = getActiveStaffUser()) {
  return resolveOperationalRole(staffUser) === OPERATIONAL_ROLES.owner;
}

export function isStaffWorkspaceView(staffUser = getActiveStaffUser()) {
  return resolveOperationalRole(staffUser) === OPERATIONAL_ROLES.staff;
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
  const routeRule = getAdminRoutePermissionRule(pathname);
  if (!routeRule || routeRule.classification !== "protected-management") {
    return false;
  }

  if (routeRule.ownerOnly && !isOwnerView(authenticatedUser)) {
    return false;
  }

  return routeRule.permissions.some((permission) =>
    hasPermission(authenticatedUser, permission)
  );
}

export function canManageArchivedQuotes(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.quoteArchiveManage);
}

export function canManageCanceledOrders(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.orderCancel);
}

export function canManageCustomerMerges(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.customerMerge);
}

export function canManageStaffUsers(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.staffManage);
}

export function canSelfAssignOrder(order = {}, staffUser = getActiveStaffUser()) {
  if (!isStaffWorkspaceView(staffUser)) return false;
  // Staff may only claim work that is currently unassigned
  return !order.assigned_to_staff_id && !order.assigned_to_staff_name;
}

export function canManageAssignments(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.assignmentManage);
}

export function canManageProductionWorkflow(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.productionManage);
}

export function canManageOrderRecords(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.orderManage);
}

export function canManageDepositWorkflow(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.depositManage);
}

export function canUseWorkflowOverrides(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.workflowOverride);
}

export function canEditCustomers(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.customerEdit);
}

export function canViewCustomers(staffUser = getActiveStaffUser()) {
  return hasPermission(staffUser, PERMISSIONS.customerView);
}

function hasAnyOperationalManagementPermission(staffUser = getActiveStaffUser()) {
  return [
    PERMISSIONS.customerEdit,
    PERMISSIONS.quoteArchiveManage,
    PERMISSIONS.depositManage,
    PERMISSIONS.staffManage,
    PERMISSIONS.catalogManage,
    PERMISSIONS.orderCancel,
    PERMISSIONS.workflowOverride,
  ].some((permission) => hasPermission(staffUser, permission));
}

function matchesAdminRouteRule(pathname, rule) {
  if (!rule) return false;
  if (rule.type === "exact") return pathname === rule.value;
  if (rule.type === "prefix") return pathname.startsWith(rule.value);
  return false;
}

function getAdminRoutePermissionRule(pathname = "") {
  const normalizedPathname = normalizeRoutePathname(pathname);
  return (
    ADMIN_ROUTE_PERMISSION_RULES.find((rule) =>
      matchesAdminRouteRule(normalizedPathname, rule)
    ) || null
  );
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
  const routeRule = getAdminRoutePermissionRule(pathname);
  if (!routeRule) return false;

  if (routeRule.ownerOnly && !isOwnerView(staffUser)) {
    return false;
  }

  return routeRule.permissions.some((permission) =>
    hasPermission(staffUser, permission)
  );
}

export function canAccessOperationalWorkspace(pathname, staffUser = getActiveStaffUser()) {
  return canAccessOwnerWorkspace(pathname, staffUser);
}

export function requiresProtectedManagementAccess(pathname = "") {
  const routeRule = getAdminRoutePermissionRule(pathname);
  return routeRule?.classification === "protected-management";
}

export function classifyAdminRoute(pathname = "") {
  const normalizedPathname = normalizeRoutePathname(pathname);
  const matchedRule = getAdminRoutePermissionRule(normalizedPathname);
  const requiresManagementAccess = matchedRule?.classification === "protected-management";

  return {
    pathname: normalizedPathname,
    isAdminRoute: normalizedPathname.startsWith("/admin"),
    classification:
      matchedRule?.classification ||
      (normalizedPathname.startsWith("/admin") ? "operational" : "non-admin"),
    requiresManagementAccess,
    matchedManagementRuleType: matchedRule?.type || "",
    matchedManagementRule: matchedRule?.value || "",
    requiredPermissions: matchedRule?.permissions || [],
  };
}
