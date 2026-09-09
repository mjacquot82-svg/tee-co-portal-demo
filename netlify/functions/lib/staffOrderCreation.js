import { randomUUID } from "node:crypto";
import { buildAuthoritativeStaffOrder } from "../../../src/lib/staffOrderCreation.js";
import { authorizeOperationalRequest } from "./operationalRequestAuth.js";

function text(value) {
  return String(value || "").trim();
}

function displayName(user = {}) {
  return text(
    user.user_metadata?.full_name ||
      user.user_metadata?.display_name ||
      user.user_metadata?.name ||
      user.app_metadata?.full_name ||
      user.app_metadata?.name ||
      user.email
  );
}

function orderNumber(now = new Date()) {
  return `TC-${now.getTime().toString().slice(-6)}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

async function findExistingOrder(supabase, actorId, idempotencyKey) {
  const result = await supabase
    .from("orders")
    .select("*")
    .contains("order_metadata", {
      created_by_auth_user_id: actorId,
      staff_create_idempotency_key: idempotencyKey,
    })
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const snapshot = result.data.quote?.__tee_co_order_snapshot || {};
  return { ...snapshot, ...result.data, quote: snapshot.quote || result.data.quote || {} };
}

function orderPayload(order, staffRow) {
  return {
    order_number: order.order_number,
    legacy_order_number: order.order_number,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    company: order.company,
    status: order.status,
    approval_status: order.approval_status,
    source: order.source,
    garment: order.garment,
    qty: order.qty,
    due_date: order.due_date || null,
    order_date: order.created_at.slice(0, 10),
    quote_status: order.quote_status,
    operational_visible: order.operational_visible,
    production_ready: order.production_ready,
    needs_assignment: order.needs_assignment,
    assigned_to_staff_user_id: staffRow?.id || null,
    assigned_to_staff_name: order.assigned_to_staff_name,
    assigned_to_staff_role: order.assigned_to_staff_role,
    assigned_at: order.assigned_at,
    placements: order.placements,
    artwork_files: [],
    artwork_approval_required: order.artwork_approval_required,
    artwork_approval_status: order.artwork_approval_status,
    artwork_status: order.artwork_status,
    quote: { ...order.quote, __tee_co_order_snapshot: order },
    size_breakdown: order.size_breakdown,
    line_items: order.line_items,
    deposit_status: "not_requested",
    deposit_required: order.deposit_required,
    deposit_workflow_status: order.deposit_workflow_status,
    deposit_requirement: order.deposit_requirement,
    deposit_requirement_status: order.deposit_requirement_status,
    deposit_details: {},
    deposit_amount: 0,
    deposit_paid_amount: 0,
    balance_due: order.balance_due,
    subtotal: order.subtotal,
    tax_amount: order.tax_amount,
    total_amount: order.total_amount,
    total_paid: 0,
    payment_status: order.payment_status,
    payment_collection_state: order.payment_collection_state,
    payment_history: [],
    invoice_status: order.invoice_status,
    decoration_type: order.decoration_type,
    placement: order.placement,
    order_metadata: order.order_metadata,
    notes: order.notes,
    internal_notes: order.internal_notes,
    activity_log: order.activity_log,
    created_by_staff_user_id: staffRow?.id || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

async function findStaffRow(supabase, userId) {
  const result = await supabase.from("staff_users").select("id,name,role,status").eq("id", userId).maybeSingle();
  if (result.error) return null;
  if (text(result.data?.status || "Active").toLowerCase() === "inactive") return null;
  return result.data || null;
}

export async function createStaffOrder(event, supabase, dependencies = {}) {
  const authorization = await (dependencies.authorize || authorizeOperationalRequest)(event, supabase);
  if (!authorization.ok) return authorization;

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return { ok: false, statusCode: 400, message: "The order request body is invalid." };
  }

  const idempotencyKey = text(input.idempotency_key);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(idempotencyKey)) {
    return { ok: false, statusCode: 400, message: "A valid idempotency key is required." };
  }

  if (!Array.isArray(input.line_items) || input.line_items.length === 0) {
    return { ok: false, statusCode: 400, message: "Add at least one product to the order." };
  }

  const actorId = text(authorization.user.id);
  const existing = await findExistingOrder(supabase, actorId, idempotencyKey);
  if (existing) return { ok: true, statusCode: 200, order: existing, duplicate: true };

  const productIds = [...new Set((Array.isArray(input.line_items) ? input.line_items : []).map((item) => text(item?.product_id)).filter(Boolean))];
  const catalogResult = await supabase.from("products").select("*").in("id", productIds);
  if (catalogResult.error) throw catalogResult.error;

  const now = dependencies.now ? dependencies.now() : new Date();
  const staffRow = await findStaffRow(supabase, actorId);
  const actor = {
    id: actorId,
    name: displayName(authorization.user),
    email: authorization.user.email || "",
    role: authorization.role,
  };
  const order = buildAuthoritativeStaffOrder({
    input,
    products: catalogResult.data || [],
    actor,
    now,
    orderNumber: (dependencies.orderNumber || orderNumber)(now),
  });
  const payload = orderPayload(order, staffRow);

  let insertResult = await supabase.from("orders").insert(payload).select("*").single();
  if (insertResult.error?.code === "23505") {
    const duplicate = await findExistingOrder(supabase, actorId, idempotencyKey);
    if (duplicate) return { ok: true, statusCode: 200, order: duplicate, duplicate: true };
  }
  if (insertResult.error) throw insertResult.error;

  return {
    ok: true,
    statusCode: 201,
    order: { ...order, id: insertResult.data.id || "" },
    duplicate: false,
  };
}
