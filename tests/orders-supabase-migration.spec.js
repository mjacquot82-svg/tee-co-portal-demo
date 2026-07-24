import { expect, test } from "@playwright/test";

import { PERSISTENCE_MODES } from "../src/lib/persistenceMode";
import {
  configureOrdersPersistenceForTests,
  createStoredOrder,
  ensureOrdersHydrated,
  getStoredOrders,
  updateStoredOrder,
} from "../src/lib/ordersStore";
import {
  buildSupabaseOrderPayload,
  mapSupabaseOrderRowToOrder,
} from "../src/lib/ordersRepository";

function getPortalVisibleOrdersForSession(orders, session) {
  const sessionEmail = String(session?.email || "").trim().toLowerCase();
  const sessionCustomerId = String(session?.id || "").trim();

  return orders.filter((order) => {
    const orderEmail = String(order.customer_email || "").trim().toLowerCase();
    const orderCustomerId = String(order.customer_id || "").trim();
    return (
      (sessionEmail && orderEmail === sessionEmail) ||
      (sessionCustomerId && orderCustomerId === sessionCustomerId)
    );
  });
}

class FakeOrdersQuery {
  constructor(client, tableName) {
    this.client = client;
    this.tableName = tableName;
    this.action = "select";
    this.payload = null;
    this.filters = [];
  }

  select() {
    return this;
  }

  order() {
    return this;
  }

  insert(payload) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  single() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    if (this.tableName !== "orders") {
      return { data: null, error: new Error(`Unexpected table ${this.tableName}`) };
    }

    if (this.action === "select") {
      return { data: this.client.rows, error: null };
    }

    if (this.action === "insert") {
      this.client.operations.push({ action: "insert", payload: this.payload });
      const row = {
        id: `remote-${this.client.rows.length + 1}`,
        ...this.payload,
      };
      this.client.rows = [row, ...this.client.rows];
      return { data: row, error: null };
    }

    if (this.action === "update") {
      this.client.operations.push({
        action: "update",
        payload: this.payload,
        filters: this.filters,
      });
      const orderNumber = this.filters.find((filter) => filter.column === "order_number")?.value;
      const index = this.client.rows.findIndex((row) => row.order_number === orderNumber);
      if (index === -1) {
        return { data: null, error: new Error(`Order ${orderNumber} not found`) };
      }
      const row = {
        ...this.client.rows[index],
        ...this.payload,
      };
      this.client.rows[index] = row;
      return { data: row, error: null };
    }

    if (this.action === "upsert") {
      this.client.operations.push({ action: "upsert", payload: this.payload });
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows.forEach((row) => {
        const index = this.client.rows.findIndex((entry) => entry.order_number === row.order_number);
        if (index === -1) {
          this.client.rows.push({ id: `remote-${this.client.rows.length + 1}`, ...row });
        } else {
          this.client.rows[index] = { ...this.client.rows[index], ...row };
        }
      });
      return { data: rows, error: null };
    }

    return { data: null, error: new Error(`Unexpected action ${this.action}`) };
  }
}

class FakeOrdersClient {
  constructor(seedRows = []) {
    this.rows = seedRows;
    this.operations = [];
  }

  from(tableName) {
    return new FakeOrdersQuery(this, tableName);
  }
}

function configureFakeOrders(seedOrders = []) {
  const client = new FakeOrdersClient(seedOrders.map(buildSupabaseOrderPayload));
  configureOrdersPersistenceForTests({
    supabaseClient: client,
    supabaseConfigured: true,
    persistenceMode: PERSISTENCE_MODES.production,
  });
  return client;
}

function configureFakeOrderRows(seedRows = []) {
  const client = new FakeOrdersClient(seedRows);
  configureOrdersPersistenceForTests({
    supabaseClient: client,
    supabaseConfigured: true,
    persistenceMode: PERSISTENCE_MODES.production,
  });
  return client;
}

test.afterEach(() => {
  configureOrdersPersistenceForTests({
    supabaseClient: null,
    supabaseConfigured: null,
    persistenceMode: null,
  });
});

test("loads orders from Supabase into an empty local cache", async () => {
  configureFakeOrders([
    {
      order_number: "TC-REMOTE-1",
      customer_name: "Remote Customer",
      customer_email: "remote@example.com",
      status: "Ready For Production",
      quote_status: "Approved",
      operational_visible: true,
      created_at: "2026-01-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    },
  ]);

  await ensureOrdersHydrated({ force: true });

  expect(getStoredOrders().map((order) => order.order_number)).toEqual(["TC-REMOTE-1"]);
  expect(getStoredOrders()[0]).toMatchObject({
    customer_name: "Remote Customer",
    quote_status: "Approved",
  });
});

test("creates orders by writing Supabase first and then publishing the local cache", async () => {
  const client = configureFakeOrders();

  const created = await createStoredOrder({
    customer_id: "customer-1784339622477",
    customer_name: "Created Customer",
    customer_email: "created@example.com",
    customer_phone: "555-0100",
    garment: "Hoodie",
    qty: 12,
    quote_status: "Draft",
    operational_visible: false,
  });

  expect(client.operations[0].action).toBe("insert");
  expect(client.operations[0].payload.order_number).toBe(created.order_number);
  expect(client.operations[0].payload.customer_id).toBe("customer-1784339622477");
  expect(getStoredOrders()[0]).toMatchObject({
    order_number: created.order_number,
    customer_name: "Created Customer",
    quote_status: "Draft",
    customer_id: "customer-1784339622477",
  });

  const customerOrders = getPortalVisibleOrdersForSession(getStoredOrders(), {
    id: "customer-1784339622477",
  });
  expect(customerOrders.map((order) => order.order_number)).toEqual([created.order_number]);
});

test("rejects incomplete customer identity before creating an order", async () => {
  const client = configureFakeOrders();
  const incompleteIdentities = [
    { customer_name: "Morgan", customer_phone: "555-0100" },
    { customer_last_name: "Lee", customer_phone: "555-0100" },
    { customer_name: "Morgan Lee", customer_phone: "" },
  ];

  for (const identity of incompleteIdentities) {
    await expect(
      createStoredOrder({
        ...identity,
        garment: "Hoodie",
        qty: 12,
        source: "Walk-in",
      })
    ).rejects.toMatchObject({ code: "CUSTOMER_IDENTITY_REQUIRED" });
  }

  expect(client.operations).toHaveLength(0);
});

test("updates orders through awaited Supabase writes", async () => {
  const client = configureFakeOrders([
    {
      order_number: "TC-UPDATE-1",
      customer_name: "Update Customer",
      status: "New",
      quote_status: "Draft",
      operational_visible: false,
      created_at: "2026-01-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    },
  ]);
  await ensureOrdersHydrated({ force: true });

  const updated = await updateStoredOrder("TC-UPDATE-1", {
    notes: "Updated through Supabase order repository.",
    activity_type: "note",
    activity_note: "Order note updated.",
  });

  expect(client.operations.at(-1)).toMatchObject({
    action: "update",
    filters: [{ column: "order_number", value: "TC-UPDATE-1" }],
  });
  expect(updated).toMatchObject({
    order_number: "TC-UPDATE-1",
    notes: "Updated through Supabase order repository.",
  });
});

test("customer portal order visibility works with Supabase-hydrated orders", async () => {
  configureFakeOrders([
    {
      order_number: "TC-PORTAL-1",
      customer_name: "Portal Customer",
      customer_email: "portal@example.com",
      status: "New",
      quote_status: "Draft",
      operational_visible: false,
      created_at: "2026-01-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    },
  ]);
  await ensureOrdersHydrated({ force: true });

  const scopedOrders = getPortalVisibleOrdersForSession(getStoredOrders(), {
    email: "portal@example.com",
  });

  expect(scopedOrders.map((order) => order.order_number)).toEqual(["TC-PORTAL-1"]);
});

test("quote and production compatibility fields survive Supabase row mapping", async () => {
  configureFakeOrders([
    {
      order_number: "TC-WORKFLOW-1",
      customer_name: "Workflow Customer",
      quote_status: "Awaiting Deposit",
      status: "Awaiting Deposit",
      operational_visible: false,
      production_ready: false,
      deposit_workflow_status: "Deposit Requested",
      workflow_overrides: {
        forceProduction: {
          active: true,
          usedByName: "Owner",
        },
      },
      quote: {
        total: 250,
      },
      created_at: "2026-01-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    },
  ]);
  await ensureOrdersHydrated({ force: true });

  const order = getStoredOrders()[0];

  expect(order).toMatchObject({
    order_number: "TC-WORKFLOW-1",
    quote_status: "Awaiting Deposit",
    deposit_workflow_status: "Deposit Requested",
    workflow_overrides: {
      forceProduction: {
        active: true,
        usedByName: "Owner",
      },
    },
    quote: {
      total: 250,
    },
  });
});

test("Phase 2B payload writes quote, deposit, payment, portal, and production fields as first-class columns", () => {
  const payload = buildSupabaseOrderPayload({
    order_number: "TC-P2B-WRITE",
    customer_name: "Phase 2B Customer",
    customer_email: "phase2b@example.com",
    customer_phone: "555-0100",
    company: "Phase 2B Co",
    quote_status: "Awaiting Deposit",
    quote_archived: true,
    request_type: "Order Request",
    artwork_approval_required: true,
    artwork_approval_status: "Pending Review",
    customer_artwork_id: "art-123",
    customer_artwork_name: "Front Logo",
    artwork_reference_names: ["Front Logo"],
    deposit_required: true,
    deposit_workflow_status: "Deposit Requested",
    deposit_requirement: "required",
    deposit_requirement_status: "Required",
    deposit: {
      status: "Deposit Requested",
      requested_at: "2026-01-02T12:00:00.000Z",
    },
    subtotal: 100,
    tax_amount: 13,
    total_amount: 113,
    total_paid: 25,
    deposit_applied: 25,
    deposit_outstanding: 75,
    balance_due: 88,
    payment_collection_state: "Awaiting Deposit",
    invoice_status: "Partial Payment",
    pickup_status: "Pending",
    payment_history: [{ amount: 25, method: "E-Transfer" }],
    production_owner_staff_id: "owner-1",
    production_owner_staff_name: "Owner",
    production_owner_staff_role: "Owner",
    production_owner_assigned_at: "2026-01-02T13:00:00.000Z",
    workflow_state: { phase: "quote" },
    workflow_overrides: { forceProduction: { active: true } },
    is_rush: true,
    decoration_type: "Screen Print",
    placement: "Front",
  });

  expect(payload).toMatchObject({
    quote_status: "Awaiting Deposit",
    quote_archived: true,
    customer_email: "phase2b@example.com",
    artwork_approval_required: true,
    artwork_approval_status: "Pending Review",
    deposit_required: true,
    deposit_workflow_status: "Deposit Requested",
    deposit_details: {
      status: "Deposit Requested",
    },
    total_amount: 113,
    total_paid: 25,
    deposit_applied: 25,
    deposit_outstanding: 75,
    payment_collection_state: "Awaiting Deposit",
    invoice_status: "Partial Payment",
    payment_history: [{ amount: 25, method: "E-Transfer" }],
    production_owner_staff_id: "owner-1",
    production_owner_staff_name: "Owner",
    workflow_state: { phase: "quote" },
    workflow_overrides: { forceProduction: { active: true } },
    is_rush: true,
    decoration_type: "Screen Print",
    placement: "Front",
  });
  expect(payload.quote.__tee_co_order_snapshot).toMatchObject({
    order_number: "TC-P2B-WRITE",
    quote_status: "Awaiting Deposit",
  });
});

test("customer portal orders preserve production text customer IDs", () => {
  const payload = buildSupabaseOrderPayload({
    order_number: "TC-CUSTOMER-LINK",
    customer_id: "customer-1784339622477",
    customer_name: "JDS Studio",
    source: "Customer Portal",
  });

  expect(payload.customer_id).toBe("customer-1784339622477");
});

test("Phase 2B row mapping prefers first-class columns over compatibility snapshot", () => {
  const row = buildSupabaseOrderPayload({
    order_number: "TC-P2B-READ",
    customer_name: "Snapshot Customer",
    customer_email: "snapshot@example.com",
    quote_status: "Draft",
    deposit_workflow_status: "Pending Decision",
    payment_collection_state: "Draft",
    production_owner_staff_name: "Snapshot Owner",
    workflow_overrides: { legacy: true },
  });

  const mapped = mapSupabaseOrderRowToOrder({
    ...row,
    customer_email: "column@example.com",
    quote_status: "Ready For Production",
    artwork_approval_required: true,
    artwork_approval_status: "Approved",
    deposit_required: true,
    deposit_workflow_status: "Deposit Received",
    deposit_details: { status: "Deposit Received", paid_at: "2026-01-03T12:00:00.000Z" },
    total_amount: 250,
    total_paid: 250,
    deposit_applied: 100,
    deposit_outstanding: 0,
    balance_due: 0,
    payment_collection_state: "Paid",
    invoice_status: "Paid",
    pickup_status: "Ready for Pickup",
    payment_history: [{ amount: 250, method: "Card" }],
    production_owner_staff_id: "owner-column",
    production_owner_staff_name: "Column Owner",
    workflow_state: { phase: "production" },
    workflow_overrides: { column: true },
    is_rush: true,
    decoration_type: "Embroidery",
    placement: "Left Chest",
  });

  expect(mapped).toMatchObject({
    customer_email: "column@example.com",
    quote_status: "Ready For Production",
    artwork_approval_required: true,
    artwork_approval_status: "Approved",
    deposit_required: true,
    deposit_workflow_status: "Deposit Received",
    deposit: { status: "Deposit Received" },
    total_amount: 250,
    total_paid: 250,
    deposit_applied: 100,
    deposit_outstanding: 0,
    balance_due: 0,
    payment_collection_state: "Paid",
    invoice_status: "Paid",
    pickup_status: "Ready for Pickup",
    payment_history: [{ amount: 250, method: "Card" }],
    production_owner_staff_id: "owner-column",
    production_owner_staff_name: "Column Owner",
    workflow_state: { phase: "production" },
    workflow_overrides: { column: true },
    is_rush: true,
    decoration_type: "Embroidery",
    placement: "Left Chest",
  });
});

test("Phase 2B hydrated orders preserve portal and workflow fields without reading them from the snapshot", async () => {
  const legacySnapshot = {
    order_number: "TC-P2B-HYDRATE",
    customer_name: "Legacy Snapshot Customer",
    customer_email: "legacy@example.com",
    quote_status: "Draft",
    deposit_workflow_status: "Pending Decision",
    payment_collection_state: "Draft",
    production_owner_staff_name: "Legacy Owner",
  };

  configureFakeOrderRows([
    {
      id: "remote-p2b",
      order_number: "TC-P2B-HYDRATE",
      customer_name: "Column Customer",
      customer_email: "portal-column@example.com",
      status: "Ready For Production",
      quote_status: "Ready For Production",
      operational_visible: true,
      production_ready: true,
      artwork_approval_required: true,
      artwork_approval_status: "Approved",
      deposit_required: true,
      deposit_workflow_status: "Deposit Received",
      deposit_details: { status: "Deposit Received" },
      total_amount: 300,
      total_paid: 150,
      balance_due: 150,
      payment_collection_state: "Partial Payment",
      invoice_status: "Partial Payment",
      payment_history: [{ amount: 150, method: "E-Transfer" }],
      production_owner_staff_id: "staff-column",
      production_owner_staff_name: "Column Owner",
      workflow_state: { phase: "production" },
      workflow_overrides: { expedite: { active: true } },
      quote: {
        __tee_co_order_snapshot: legacySnapshot,
      },
      created_at: "2026-01-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    },
  ]);

  await ensureOrdersHydrated({ force: true });

  const order = getStoredOrders()[0];
  const scopedOrders = getPortalVisibleOrdersForSession(getStoredOrders(), {
    email: "portal-column@example.com",
  });

  expect(scopedOrders.map((entry) => entry.order_number)).toEqual(["TC-P2B-HYDRATE"]);
  expect(order).toMatchObject({
    customer_name: "Column Customer",
    customer_email: "portal-column@example.com",
    quote_status: "Ready For Production",
    artwork_approval_status: "Approved",
    deposit_workflow_status: "Deposit Received",
    payment_collection_state: "Awaiting Final Payment",
    invoice_status: "Partial Payment",
    total_amount: 300,
    total_paid: 150,
    balance_due: 150,
    production_ready: true,
    production_owner_staff_name: "Column Owner",
    workflow_state: "Ready For Production",
  });
});
