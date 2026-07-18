import {
  assertSupabasePersistenceAvailable,
  buildSupabasePersistenceFailure,
  canUseLocalPersistenceFallback,
  getPersistenceMode,
} from "./persistenceMode";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const ORDERS_TABLE = "orders";
const ORDER_SNAPSHOT_KEY = "__tee_co_order_snapshot";

let testSupabaseClient = null;
let testSupabaseConfigured = null;
let testPersistenceMode = null;

function getSupabaseClient() {
  return testSupabaseClient || supabase;
}

function getSupabaseConfigured() {
  return testSupabaseConfigured !== null
    ? testSupabaseConfigured
    : isSupabaseConfigured;
}

function getActivePersistenceMode() {
  return testPersistenceMode || getPersistenceMode();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function toUuidOrNull(value) {
  const normalizedValue = String(value || "").trim();
  return isUuidLike(normalizedValue) ? normalizedValue : null;
}

function toNumber(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function toBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (normalizedValue === "true") return true;
  if (normalizedValue === "false") return false;
  return null;
}

function toText(value, fallback = "") {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || fallback;
}

function toJsonObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function toJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    const normalizedValue = String(value ?? "").trim();
    if (normalizedValue) return normalizedValue;
  }
  return "";
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function toDateOnly(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toTimestampOrNull(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;

  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function withoutOrderSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value || null;
  }

  const { [ORDER_SNAPSHOT_KEY]: _snapshot, ...rest } = value;
  return rest;
}

export function buildSupabaseOrderPayload(order = {}) {
  const quotePayload =
    order.quote && typeof order.quote === "object" && !Array.isArray(order.quote)
      ? { ...order.quote }
      : {};

  return {
    legacy_order_number: order.legacy_order_number || order.order_number || null,
    order_number: String(order.order_number || "").trim(),
    customer_id: toText(order.customer_id) || null,
    customer_name: String(order.customer_name || "").trim(),
    status: String(order.status || "New").trim() || "New",
    approval_status: String(order.approval_status || "Not Sent").trim() || "Not Sent",
    source: String(order.source || "Staff Entry").trim() || "Staff Entry",
    garment: String(order.garment || order.item || "").trim(),
    qty: toInteger(order.qty || order.quantity || order.total_quantity, 0),
    due_date: toDateOnly(order.due_date || order.pickup_date),
    order_date: toDateOnly(order.order_date || order.date || order.created_at),
    quote_status: toText(order.quote_status, "Draft"),
    quote_archived: Boolean(order.quote_archived),
    request_type: toText(order.request_type),
    customer_email: toText(order.customer_email || order.email),
    customer_phone: toText(order.customer_phone || order.phone),
    company: toText(order.company),
    operational_visible: order.operational_visible !== false,
    production_ready: Boolean(order.production_ready),
    needs_assignment: order.needs_assignment !== false,
    assigned_to_staff_user_id: toUuidOrNull(order.assigned_to_staff_id),
    assigned_to_staff_name: String(order.assigned_to_staff_name || "").trim(),
    assigned_to_staff_role: String(order.assigned_to_staff_role || "").trim(),
    assigned_at: toTimestampOrNull(order.assigned_at || order.production_owner_assigned_at),
    production_owner_staff_id: toText(
      order.production_owner_staff_id || order.assigned_to_staff_id
    ),
    production_owner_staff_name: toText(
      order.production_owner_staff_name || order.assigned_to_staff_name
    ),
    production_owner_staff_role: toText(
      order.production_owner_staff_role || order.assigned_to_staff_role
    ),
    production_owner_assigned_at: toTimestampOrNull(
      order.production_owner_assigned_at || order.assigned_at
    ),
    placements: Array.isArray(order.placements) ? order.placements : [],
    artwork_files: Array.isArray(order.artwork_files) ? order.artwork_files : [],
    artwork_approval_required: Boolean(order.artwork_approval_required),
    artwork_approval_status: toText(order.artwork_approval_status, "Not Required"),
    artwork_status: toText(order.artwork_status),
    approval_note: toText(order.approval_note),
    customer_artwork_id: toText(order.customer_artwork_id),
    customer_artwork_name: toText(order.customer_artwork_name),
    artwork_reference_names: toJsonArray(order.artwork_reference_names),
    quote: {
      ...quotePayload,
      [ORDER_SNAPSHOT_KEY]: order,
    },
    size_breakdown:
      order.size_breakdown && typeof order.size_breakdown === "object"
        ? order.size_breakdown
        : null,
    line_items: Array.isArray(order.line_items) ? order.line_items : [],
    deposit_status: String(
      order.deposit_status || order.deposit_workflow_status || "not_requested"
    ),
    deposit_required: toBooleanOrNull(order.deposit_required),
    deposit_workflow_status: toText(
      order.deposit_workflow_status || order.deposit?.status,
      "Deposit Not Required"
    ),
    deposit_requirement: toText(order.deposit_requirement),
    deposit_requirement_status: toText(order.deposit_requirement_status),
    deposit_details: toJsonObject(order.deposit),
    deposit_amount: toNumber(order.deposit_amount || order.deposit?.amount, 0),
    deposit_paid_amount: toNumber(order.deposit_paid_amount || order.deposit_applied, 0),
    deposit_paid_at: toTimestampOrNull(order.deposit_paid_at),
    subtotal: toNumber(order.subtotal, 0),
    tax_amount: toNumber(order.tax_amount, 0),
    total_amount: toNumber(order.total_amount || order.total, 0),
    total_paid: toNumber(order.total_paid || order.amount_paid || order.paid_amount, 0),
    deposit_applied: toNumber(order.deposit_applied || order.deposit_paid_amount, 0),
    deposit_outstanding: toNumber(order.deposit_outstanding, 0),
    balance_due: toNumber(order.balance_due, 0),
    payment_status: String(order.payment_status || "unpaid"),
    payment_method: String(order.payment_method || ""),
    payment_reference: String(order.payment_reference || ""),
    payment_collection_state: toText(order.payment_collection_state),
    invoice_status: toText(order.invoice_status),
    pickup_status: toText(order.pickup_status),
    payment_history: toJsonArray(order.payment_history),
    workflow_state: toJsonObject(order.workflow_state),
    workflow_overrides: toJsonObject(order.workflow_overrides),
    is_rush: Boolean(order.is_rush),
    decoration_type: toText(order.decoration_type || order.production_type),
    placement: toText(order.placement),
    order_metadata: toJsonObject(order.order_metadata),
    notes: String(order.notes || ""),
    internal_notes: String(order.internal_notes || ""),
    activity_log: Array.isArray(order.activity_log) ? order.activity_log : [],
    created_by_staff_user_id: toUuidOrNull(order.created_by_staff_id),
    updated_by_staff_user_id: toUuidOrNull(order.updated_by_staff_id),
    created_at: toTimestampOrNull(order.created_at) || new Date().toISOString(),
    updated_at: toTimestampOrNull(order.updated_at) || new Date().toISOString(),
  };
}

export function mapSupabaseOrderRowToOrder(row = {}) {
  const quote = row.quote && typeof row.quote === "object" ? row.quote : {};
  const snapshot = quote[ORDER_SNAPSHOT_KEY] || {};

  return {
    ...snapshot,
    id: row.id || snapshot.id || "",
    legacy_order_number: row.legacy_order_number || snapshot.legacy_order_number || "",
    order_number: row.order_number || snapshot.order_number || "",
    customer_id: row.customer_id || snapshot.customer_id || "",
    customer_name: row.customer_name ?? snapshot.customer_name ?? "",
    status: row.status || snapshot.status || "New",
    approval_status: row.approval_status || snapshot.approval_status || "Not Sent",
    source: row.source || snapshot.source || "Staff Entry",
    garment: row.garment ?? snapshot.garment ?? "",
    qty: row.qty ?? snapshot.qty ?? 0,
    due_date: row.due_date || snapshot.due_date || "",
    order_date: row.order_date || snapshot.order_date || "",
    quote_status: firstText(row.quote_status, snapshot.quote_status, "Draft"),
    quote_archived:
      typeof row.quote_archived === "boolean"
        ? row.quote_archived
        : Boolean(snapshot.quote_archived),
    request_type: firstText(row.request_type, snapshot.request_type),
    customer_email: firstText(row.customer_email, snapshot.customer_email, snapshot.email),
    customer_phone: firstText(row.customer_phone, snapshot.customer_phone, snapshot.phone),
    company: firstText(row.company, snapshot.company),
    operational_visible:
      typeof row.operational_visible === "boolean"
        ? row.operational_visible
        : snapshot.operational_visible,
    production_ready:
      typeof row.production_ready === "boolean"
        ? row.production_ready
        : snapshot.production_ready,
    needs_assignment:
      typeof row.needs_assignment === "boolean"
        ? row.needs_assignment
        : snapshot.needs_assignment,
    assigned_to_staff_id:
      row.assigned_to_staff_user_id || snapshot.assigned_to_staff_id || "",
    assigned_to_staff_name:
      row.assigned_to_staff_name ?? snapshot.assigned_to_staff_name ?? "",
    assigned_to_staff_role:
      row.assigned_to_staff_role ?? snapshot.assigned_to_staff_role ?? "",
    assigned_at: row.assigned_at || snapshot.assigned_at || null,
    production_owner_staff_id: firstText(
      row.production_owner_staff_id,
      snapshot.production_owner_staff_id,
      row.assigned_to_staff_user_id,
      snapshot.assigned_to_staff_id
    ),
    production_owner_staff_name: firstText(
      row.production_owner_staff_name,
      snapshot.production_owner_staff_name,
      row.assigned_to_staff_name,
      snapshot.assigned_to_staff_name
    ),
    production_owner_staff_role: firstText(
      row.production_owner_staff_role,
      snapshot.production_owner_staff_role,
      row.assigned_to_staff_role,
      snapshot.assigned_to_staff_role
    ),
    production_owner_assigned_at:
      row.production_owner_assigned_at ||
      snapshot.production_owner_assigned_at ||
      row.assigned_at ||
      snapshot.assigned_at ||
      null,
    placements: Array.isArray(row.placements) ? row.placements : snapshot.placements || [],
    artwork_files: Array.isArray(row.artwork_files)
      ? row.artwork_files
      : snapshot.artwork_files || [],
    artwork_approval_required:
      typeof row.artwork_approval_required === "boolean"
        ? row.artwork_approval_required
        : Boolean(snapshot.artwork_approval_required),
    artwork_approval_status: firstText(
      row.artwork_approval_status,
      snapshot.artwork_approval_status,
      snapshot.approval_status,
      "Not Required"
    ),
    artwork_status: firstText(row.artwork_status, snapshot.artwork_status),
    approval_note: firstText(row.approval_note, snapshot.approval_note),
    customer_artwork_id: firstText(row.customer_artwork_id, snapshot.customer_artwork_id),
    customer_artwork_name: firstText(
      row.customer_artwork_name,
      snapshot.customer_artwork_name
    ),
    artwork_reference_names: Array.isArray(row.artwork_reference_names)
      ? row.artwork_reference_names
      : snapshot.artwork_reference_names || [],
    quote: withoutOrderSnapshot(quote),
    size_breakdown: row.size_breakdown || snapshot.size_breakdown || null,
    line_items: Array.isArray(row.line_items) ? row.line_items : snapshot.line_items || [],
    deposit_status: row.deposit_status || snapshot.deposit_status || "",
    deposit_required:
      typeof row.deposit_required === "boolean"
        ? row.deposit_required
        : firstDefined(snapshot.deposit_required, null),
    deposit_workflow_status: firstText(
      row.deposit_workflow_status,
      snapshot.deposit_workflow_status,
      snapshot.deposit?.status,
      "Deposit Not Required"
    ),
    deposit_requirement: firstText(
      row.deposit_requirement,
      snapshot.deposit_requirement
    ),
    deposit_requirement_status: firstText(
      row.deposit_requirement_status,
      snapshot.deposit_requirement_status
    ),
    deposit: toJsonObject(row.deposit_details, snapshot.deposit || {}),
    deposit_amount: row.deposit_amount ?? snapshot.deposit_amount ?? 0,
    deposit_paid_amount: row.deposit_paid_amount ?? snapshot.deposit_paid_amount ?? 0,
    deposit_paid_at: row.deposit_paid_at || snapshot.deposit_paid_at || null,
    subtotal: row.subtotal ?? snapshot.subtotal ?? 0,
    tax_amount: row.tax_amount ?? snapshot.tax_amount ?? 0,
    total_amount: row.total_amount ?? snapshot.total_amount ?? snapshot.total ?? 0,
    total: row.total_amount ?? snapshot.total ?? snapshot.total_amount ?? 0,
    total_paid:
      row.total_paid ?? snapshot.total_paid ?? snapshot.amount_paid ?? snapshot.paid_amount ?? 0,
    deposit_applied:
      row.deposit_applied ?? snapshot.deposit_applied ?? row.deposit_paid_amount ?? 0,
    deposit_outstanding: row.deposit_outstanding ?? snapshot.deposit_outstanding ?? 0,
    balance_due: row.balance_due ?? snapshot.balance_due ?? 0,
    payment_status: row.payment_status || snapshot.payment_status || "",
    payment_method: row.payment_method ?? snapshot.payment_method ?? "",
    payment_reference: row.payment_reference ?? snapshot.payment_reference ?? "",
    payment_collection_state: firstText(
      row.payment_collection_state,
      snapshot.payment_collection_state
    ),
    invoice_status: firstText(row.invoice_status, snapshot.invoice_status),
    pickup_status: firstText(row.pickup_status, snapshot.pickup_status),
    payment_history: Array.isArray(row.payment_history)
      ? row.payment_history
      : snapshot.payment_history || [],
    workflow_state: toJsonObject(row.workflow_state, snapshot.workflow_state || {}),
    workflow_overrides: toJsonObject(
      row.workflow_overrides,
      snapshot.workflow_overrides || {}
    ),
    is_rush:
      typeof row.is_rush === "boolean" ? row.is_rush : Boolean(snapshot.is_rush),
    decoration_type: firstText(
      row.decoration_type,
      snapshot.decoration_type,
      snapshot.production_type
    ),
    placement: firstText(row.placement, snapshot.placement),
    order_metadata: toJsonObject(row.order_metadata, snapshot.order_metadata || {}),
    notes: row.notes ?? snapshot.notes ?? "",
    internal_notes: row.internal_notes ?? snapshot.internal_notes ?? "",
    activity_log: Array.isArray(row.activity_log) ? row.activity_log : snapshot.activity_log || [],
    created_by_staff_id:
      row.created_by_staff_user_id || snapshot.created_by_staff_id || "",
    updated_by_staff_id:
      row.updated_by_staff_user_id || snapshot.updated_by_staff_id || "",
    created_at: row.created_at || snapshot.created_at || "",
    updated_at: row.updated_at || snapshot.updated_at || "",
  };
}

async function runOrderQuery(operationName, queryFactory, fallbackValue) {
  const mode = getActivePersistenceMode();
  const client = getSupabaseClient();
  const configured = getSupabaseConfigured();

  assertSupabasePersistenceAvailable({
    mode,
    table: ORDERS_TABLE,
    operation: operationName,
    isConfigured: configured,
    hasClient: Boolean(client),
  });

  if (!configured || !client) {
    return fallbackValue;
  }

  try {
    const result = await queryFactory(client);
    if (result?.error) throw result.error;
    return result?.data ?? fallbackValue;
  } catch (error) {
    if (!canUseLocalPersistenceFallback(mode)) {
      throw buildSupabasePersistenceFailure({
        mode,
        table: ORDERS_TABLE,
        operation: operationName,
        cause: error,
      });
    }

    console.error("[ordersRepository] Supabase fallback triggered", {
      mode,
      operation: operationName,
      error,
    });
    return fallbackValue;
  }
}

export async function fetchOrdersFromSupabase() {
  const rows = await runOrderQuery(
    "list",
    (client) =>
      client.from(ORDERS_TABLE).select("*").order("created_at", { ascending: false }),
    null
  );

  return Array.isArray(rows) ? rows.map(mapSupabaseOrderRowToOrder) : null;
}

export async function createOrderInSupabase(order) {
  const payload = buildSupabaseOrderPayload(order);
  const row = await runOrderQuery(
    "create",
    (client) =>
      client.from(ORDERS_TABLE).insert(payload).select("*").single(),
    null
  );

  return row ? mapSupabaseOrderRowToOrder(row) : order;
}

export async function updateOrderInSupabase(orderNumber, order) {
  const payload = buildSupabaseOrderPayload(order);
  const row = await runOrderQuery(
    "update",
    (client) =>
      client
        .from(ORDERS_TABLE)
        .update(payload)
        .eq("order_number", orderNumber)
        .select("*")
        .single(),
    null
  );

  return row ? mapSupabaseOrderRowToOrder(row) : order;
}

export async function upsertOrdersInSupabase(orders = []) {
  const payload = (Array.isArray(orders) ? orders : []).map(buildSupabaseOrderPayload);
  if (!payload.length) return [];

  const rows = await runOrderQuery(
    "upsert",
    (client) =>
      client
        .from(ORDERS_TABLE)
        .upsert(payload, { onConflict: "order_number" })
        .select("*"),
    []
  );

  return Array.isArray(rows) ? rows.map(mapSupabaseOrderRowToOrder) : [];
}

export function configureOrdersRepositoryForTests({
  supabaseClient = null,
  supabaseConfigured = null,
  persistenceMode = null,
} = {}) {
  testSupabaseClient = supabaseClient;
  testSupabaseConfigured = supabaseConfigured;
  testPersistenceMode = persistenceMode;
}
