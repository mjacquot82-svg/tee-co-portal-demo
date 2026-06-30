#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ORDER_SNAPSHOT_KEY = "__tee_co_order_snapshot";

function parseArgs(argv) {
  const args = {
    input: "",
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
    }
  }

  return args;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function toUuidOrNull(value) {
  const normalizedValue = String(value || "").trim();
  return isUuidLike(normalizedValue) ? normalizedValue : null;
}

function toDateOnly(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return normalizedValue;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toTimestampOrNull(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
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

function toJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildOrderPayload(order = {}) {
  const quote = order.quote && typeof order.quote === "object" && !Array.isArray(order.quote)
    ? { ...order.quote }
    : {};

  return {
    legacy_order_number: order.legacy_order_number || order.order_number || null,
    order_number: String(order.order_number || "").trim(),
    customer_id: toUuidOrNull(order.customer_id),
    customer_name: String(order.customer_name || "").trim(),
    status: String(order.status || "New").trim() || "New",
    approval_status: String(order.approval_status || "Not Sent").trim() || "Not Sent",
    source: String(order.source || "Staff Entry").trim() || "Staff Entry",
    garment: String(order.garment || order.item || "").trim(),
    qty: Math.round(toNumber(order.qty || order.quantity || order.total_quantity, 0)),
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
    production_owner_staff_id: toText(order.production_owner_staff_id || order.assigned_to_staff_id),
    production_owner_staff_name: toText(order.production_owner_staff_name || order.assigned_to_staff_name),
    production_owner_staff_role: toText(order.production_owner_staff_role || order.assigned_to_staff_role),
    production_owner_assigned_at: toTimestampOrNull(order.production_owner_assigned_at || order.assigned_at),
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
      ...quote,
      [ORDER_SNAPSHOT_KEY]: order,
    },
    size_breakdown:
      order.size_breakdown && typeof order.size_breakdown === "object"
        ? order.size_breakdown
        : null,
    line_items: Array.isArray(order.line_items) ? order.line_items : [],
    deposit_status: String(order.deposit_status || order.deposit_workflow_status || "not_requested"),
    deposit_required: toBooleanOrNull(order.deposit_required),
    deposit_workflow_status: toText(order.deposit_workflow_status || order.deposit?.status, "Deposit Not Required"),
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/migrate-orders-to-supabase.mjs --input orders.json [--execute]");
  }

  const fileContents = await fs.readFile(args.input, "utf8");
  const orders = JSON.parse(fileContents);
  if (!Array.isArray(orders)) {
    throw new Error("Input file must contain a JSON array of orders.");
  }

  const payload = orders.map(buildOrderPayload).filter((order) => order.order_number);
  const duplicateOrderNumbers = payload
    .map((order) => order.order_number)
    .filter((orderNumber, index, values) => values.indexOf(orderNumber) !== index);

  console.log(JSON.stringify({
    mode: args.execute ? "execute" : "dry-run",
    input: args.input,
    inputCount: orders.length,
    validOrderCount: payload.length,
    duplicateOrderNumbers: Array.from(new Set(duplicateOrderNumbers)),
    orderNumbers: payload.map((order) => order.order_number),
  }, null, 2));

  if (!args.execute) {
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --execute.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await client
    .from("orders")
    .upsert(payload, { onConflict: "order_number" })
    .select("order_number");

  if (error) {
    throw error;
  }

  console.log(JSON.stringify({
    mode: "execute",
    upsertedCount: Array.isArray(data) ? data.length : 0,
    upsertedOrderNumbers: Array.isArray(data) ? data.map((order) => order.order_number) : [],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
