// @ts-check
import { expect, test } from "@playwright/test";
import { canAccessOperationalWorkspace } from "../src/admin/adminRoleView.js";
import { buildAuthoritativeStaffOrder } from "../src/lib/staffOrderCreation.js";
import { createStaffOrder } from "../netlify/functions/lib/staffOrderCreation.js";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Catalog Tee",
  status: "Active",
  category: "T-Shirts",
  colors: ["Black", "White"],
  sizes: ["S", "M", "L"],
  placements: ["Front", "Back"],
  placement_prices: { Front: 2, Back: 3 },
  decoration_types: ["DTF"],
  production_methods: ["DTF"],
  production_method_prices: { DTF: 1 },
  base_garment_price: 10,
};

const validInput = {
  idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  customer_name: "Morgan Lee",
  customer_phone: "555-0100",
  customer_email: "morgan@example.com",
  total_amount: 1,
  line_items: [
    {
      id: "line-1",
      product_id: product.id,
      selected_color: "Black",
      decoration_type: "DTF",
      placement: "Front",
      size_breakdown: { S: 2, M: 1 },
    },
    {
      id: "line-2",
      product_id: product.id,
      selected_color: "White",
      decoration_type: "DTF",
      placement: "Back",
      size_breakdown: { L: 2 },
    },
  ],
};

const staffActor = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Alex Staff",
  email: "alex@example.com",
  role: "staff",
};

function makeSupabaseFake() {
  /** @type {any[]} */
  const orders = [];
  const fake = {
    orders,
    from(table) {
      if (table === "products") {
        return { select: () => ({ in: async () => ({ data: [product], error: null }) }) };
      }
      if (table === "staff_users") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table !== "orders") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          contains: (_column, match) => ({
            maybeSingle: async () => ({
              data: orders.find((row) =>
                row.order_metadata?.created_by_auth_user_id === match.created_by_auth_user_id &&
                row.order_metadata?.staff_create_idempotency_key === match.staff_create_idempotency_key
              ) || null,
              error: null,
            }),
          }),
        }),
        insert: (payload) => ({
          select: () => ({
            single: async () => {
              const row = { id: "33333333-3333-4333-8333-333333333333", ...payload };
              orders.push(row);
              return { data: row, error: null };
            },
          }),
        }),
      };
    },
  };
  return fake;
}

test("server builds a production-visible unpaid order with authoritative multi-line pricing and staff attribution", () => {
  const order = buildAuthoritativeStaffOrder({
    input: validInput,
    products: [product],
    actor: staffActor,
    now: new Date("2026-09-09T12:00:00.000Z"),
    orderNumber: "TC-STAFF-1",
  });

  expect(order).toMatchObject({
    order_number: "TC-STAFF-1",
    source: "Staff Portal",
    status: "New",
    quote_status: "Ready For Production",
    operational_visible: true,
    production_ready: true,
    payment_status: "unpaid",
    total_paid: 0,
    created_by_staff_id: staffActor.id,
    created_by_staff_name: "Alex Staff",
    assigned_to_staff_id: staffActor.id,
    qty: 5,
  });
  expect(order.line_items).toHaveLength(2);
  expect(order.subtotal).toBe(67);
  expect(order.tax_amount).toBe(8.71);
  expect(order.total_amount).toBe(75.71);
  expect(order.total_amount).not.toBe(validInput.total_amount);
  expect(order.balance_due).toBe(75.71);
});

test("server rejects missing identity and stale or tampered catalog options", () => {
  expect(() => buildAuthoritativeStaffOrder({
    input: { ...validInput, customer_name: "Morgan" }, products: [product], actor: staffActor, orderNumber: "TC-X",
  })).toThrow(/last name/i);
  expect(() => buildAuthoritativeStaffOrder({
    input: { ...validInput, line_items: [{ ...validInput.line_items[0], selected_color: "Deleted Color" }] }, products: [product], actor: staffActor, orderNumber: "TC-X",
  })).toThrow(/unavailable color/i);
  expect(() => buildAuthoritativeStaffOrder({
    input: { ...validInput, line_items: [{ ...validInput.line_items[0], product_id: "deleted" }] }, products: [product], actor: staffActor, orderNumber: "TC-X",
  })).toThrow(/no longer available/i);
});

test("staff endpoint denies unauthenticated and customer sessions without querying order data", async () => {
  const unreachable = { from: () => { throw new Error("database should not be queried"); } };
  const unauthenticated = await createStaffOrder(
    { body: JSON.stringify(validInput) },
    unreachable,
    { authorize: async () => ({ ok: false, statusCode: 401, message: "Authentication is required." }) }
  );
  const customer = await createStaffOrder(
    { body: JSON.stringify(validInput) },
    unreachable,
    { authorize: async () => ({ ok: false, statusCode: 403, message: "Operational staff access is required." }) }
  );
  expect(unauthenticated.statusCode).toBe(401);
  expect(customer.statusCode).toBe(403);
});

test("authenticated staff creation derives identity from auth and is idempotent", async () => {
  const supabase = makeSupabaseFake();
  const authorize = async () => ({
    ok: true,
    role: "staff",
    user: {
      id: staffActor.id,
      email: staffActor.email,
      app_metadata: { operational_role: "staff" },
      user_metadata: { full_name: staffActor.name },
    },
  });
  const dependencies = {
    authorize,
    now: () => new Date("2026-09-09T12:00:00.000Z"),
    orderNumber: () => "TC-STAFF-2",
  };

  const first = await createStaffOrder({ body: JSON.stringify(validInput) }, supabase, dependencies);
  const retry = await createStaffOrder({ body: JSON.stringify({ ...validInput, total_amount: 0 }) }, supabase, dependencies);

  expect(first.statusCode).toBe(201);
  expect(retry.statusCode).toBe(200);
  expect(retry.duplicate).toBe(true);
  expect(supabase.orders).toHaveLength(1);
  expect(first.order.order_metadata).toMatchObject({
    created_by_auth_user_id: staffActor.id,
    created_by_staff_name: staffActor.name,
    staff_create_idempotency_key: validInput.idempotency_key,
  });
});

test("staff order route preserves role boundaries", () => {
  const staff = { id: staffActor.id, name: staffActor.name, role: "Staff" };
  expect(canAccessOperationalWorkspace("/admin/orders/create", staff)).toBe(true);
  expect(canAccessOperationalWorkspace("/admin/settings/notifications", staff)).toBe(false);
  expect(canAccessOperationalWorkspace("/admin/staff-users", staff)).toBe(false);
  expect(canAccessOperationalWorkspace("/admin/orders/create", null)).toBe(false);
});

test("migration adds a scoped unique retry guard without altering order architecture", async () => {
  const migration = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../supabase/staff-order-idempotency-migration.sql", import.meta.url), "utf8")
  );
  expect(migration).toContain("create unique index if not exists orders_staff_create_idempotency_idx");
  expect(migration).toContain("created_by_auth_user_id");
  expect(migration).toContain("staff_create_idempotency_key");
  expect(migration).not.toMatch(/drop table|delete from|truncate/i);
});
