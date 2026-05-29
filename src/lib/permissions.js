export const PERMISSIONS = Object.freeze({
  customerView: "customer.view",
  customerEdit: "customer.edit",
  customerMerge: "customer.merge",
  artworkManage: "artwork.manage",
  quoteManage: "quote.manage",
  quoteArchiveManage: "quote.archive.manage",
  orderManage: "order.manage",
  orderCancel: "order.cancel",
  productionManage: "production.manage",
  assignmentManage: "assignment.manage",
  workflowOverride: "workflow.override",
  depositManage: "deposit.manage",
  staffManage: "staff.manage",
  catalogManage: "catalog.manage",
  settingsManage: "settings.manage",
});

export const OPERATIONAL_ROLES = Object.freeze({
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
});

const ALL_PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));
const FULL_ACCESS_PERMISSION = "*";

const ROLE_PERMISSION_MAP = Object.freeze({
  [OPERATIONAL_ROLES.owner]: Object.freeze([FULL_ACCESS_PERMISSION]),
  [OPERATIONAL_ROLES.manager]: Object.freeze([
    PERMISSIONS.customerView,
    PERMISSIONS.customerEdit,
    PERMISSIONS.customerMerge,
    PERMISSIONS.artworkManage,
    PERMISSIONS.quoteManage,
    PERMISSIONS.quoteArchiveManage,
    PERMISSIONS.orderManage,
    PERMISSIONS.orderCancel,
    PERMISSIONS.productionManage,
    PERMISSIONS.assignmentManage,
    PERMISSIONS.workflowOverride,
    PERMISSIONS.depositManage,
    PERMISSIONS.staffManage,
    PERMISSIONS.catalogManage,
  ]),
  [OPERATIONAL_ROLES.staff]: Object.freeze([
    PERMISSIONS.customerView,
    PERMISSIONS.artworkManage,
    PERMISSIONS.quoteManage,
    PERMISSIONS.orderManage,
    PERMISSIONS.productionManage,
    PERMISSIONS.assignmentManage,
  ]),
});

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeOperationalRole(role) {
  const normalizedRole = normalizeText(role).toLowerCase();

  if (normalizedRole === "owner") return OPERATIONAL_ROLES.owner;
  if (normalizedRole === "manager") return OPERATIONAL_ROLES.manager;
  if (normalizedRole === "staff") return OPERATIONAL_ROLES.staff;

  return "";
}

export function getRolePermissionList(role) {
  const normalizedRole = normalizeOperationalRole(role);
  return ROLE_PERMISSION_MAP[normalizedRole] || [];
}

export function expandPermissions(permissionValues = []) {
  const normalizedPermissions = Array.from(
    new Set(
      (Array.isArray(permissionValues) ? permissionValues : [])
        .map((permission) => normalizeText(permission))
        .filter(Boolean)
    )
  );

  if (normalizedPermissions.includes(FULL_ACCESS_PERMISSION)) {
    return [FULL_ACCESS_PERMISSION, ...ALL_PERMISSION_VALUES];
  }

  return normalizedPermissions;
}

export function getPermissionSetForUser(user = null) {
  if (!user) return new Set();

  const explicitPermissions = expandPermissions(user.permissions);
  if (explicitPermissions.length > 0) {
    return new Set(explicitPermissions);
  }

  return new Set(expandPermissions(getRolePermissionList(user.role)));
}

export function getPermissionListForUser(user = null) {
  return Array.from(getPermissionSetForUser(user));
}

export function hasPermission(user, permission) {
  const normalizedPermission = normalizeText(permission);
  if (!normalizedPermission) return false;

  const permissionSet = getPermissionSetForUser(user);
  return (
    permissionSet.has(FULL_ACCESS_PERMISSION) ||
    permissionSet.has(normalizedPermission)
  );
}

export function hasAnyPermission(user, permissions = []) {
  return (Array.isArray(permissions) ? permissions : []).some((permission) =>
    hasPermission(user, permission)
  );
}

export function hasAllPermissions(user, permissions = []) {
  return (Array.isArray(permissions) ? permissions : []).every((permission) =>
    hasPermission(user, permission)
  );
}

export function resolveUserBusinessScope(user = null) {
  return (
    normalizeText(user?.businessScope) ||
    normalizeText(user?.business_scope) ||
    normalizeText(user?.businessId) ||
    normalizeText(user?.business_id)
  );
}

export function buildPermissionAccessProfile(user = null) {
  const role = normalizeOperationalRole(user?.role);
  return {
    role,
    permissions: getPermissionListForUser({ ...user, role }),
    businessScope: resolveUserBusinessScope(user),
  };
}
