// @ts-check
import { test, expect } from "@playwright/test";
import {
  configurePaymentsPersistenceForTests,
  createPaymentRequest,
  flushPaymentsPersistenceForTests,
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  recordPayment,
  refreshPaymentsFromSupabase,
  resetStoredPaymentsForTests,
} from "../src/lib/paymentsStore.js";
import {
  findPaymentRequestForOrder,
  getCustomerPortalPaymentData,
} from "../src/customer-portal/customerPortalPayments.js";
import { createAndSendDepositPaymentRequestForOrder } from "../src/orders/depositRequests.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getColumnValue(row, column) {
  if (column.startsWith("payload->>")) {
    return row.payload?.[column.slice("payload->>".length)];
  }
  return row[column];
}

class FakeSupabaseQuery {
  constructor(client, tableName) {
    this.client = client;
    this.tableName = tableName;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
    this.orFilters = [];
    this.orderBy = null;
    this.singleMode = null;
  }

  select() {
    return this;
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: Boolean(options.ascending) };
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  or(expression) {
    this.orFilters = String(expression || "")
      .split(",")
      .map((entry) => {
        const [column, value] = entry.split(".eq.");
        return { column, value };
      })
      .filter((entry) => entry.column && entry.value != null);
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload || {};
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    if (this.operation === "insert") return this.executeInsert();
    if (this.operation === "update") return this.executeUpdate();
    return this.executeSelect();
  }

  tableRows() {
    return this.client.tables[this.tableName] || [];
  }

  applyFilters(rows) {
    let nextRows = rows.filter((row) =>
      this.filters.every((filter) => String(getColumnValue(row, filter.column) || "") === String(filter.value))
    );
    if (this.orFilters.length) {
      nextRows = nextRows.filter((row) =>
        this.orFilters.some((filter) => String(getColumnValue(row, filter.column) || "") === String(filter.value))
      );
    }
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      nextRows = [...nextRows].sort((left, right) => {
        const leftTime = new Date(left[column] || 0).getTime();
        const rightTime = new Date(right[column] || 0).getTime();
        return ascending ? leftTime - rightTime : rightTime - leftTime;
      });
    }
    return nextRows;
  }

  duplicateError() {
    return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
  }

  isDuplicate(row) {
    const rows = this.tableRows();
    if (rows.some((entry) => row.id && entry.id === row.id)) return true;
    if (this.tableName === "payment_requests") {
      return rows.some((entry) => row.request_number && entry.request_number === row.request_number);
    }
    if (this.tableName === "payments") {
      return rows.some((entry) => row.idempotency_key && entry.idempotency_key === row.idempotency_key);
    }
    return false;
  }

  formatResult(rows) {
    if (this.singleMode === "single") {
      return rows[0] ? { data: clone(rows[0]), error: null } : { data: null, error: { message: "No rows" } };
    }
    if (this.singleMode === "maybe") {
      return { data: rows[0] ? clone(rows[0]) : null, error: null };
    }
    return { data: clone(rows), error: null };
  }

  executeInsert() {
    const rows = this.tableRows();
    const insertedRows = this.payload.map((row) => clone(row));
    if (insertedRows.some((row) => this.isDuplicate(row))) return this.duplicateError();
    rows.push(...insertedRows);
    return this.formatResult(insertedRows);
  }

  executeUpdate() {
    const rows = this.tableRows();
    const updatedRows = [];
    rows.forEach((row, index) => {
      if (!this.applyFilters([row]).length) return;
      rows[index] = { ...row, ...clone(this.payload) };
      updatedRows.push(rows[index]);
    });
    return this.formatResult(updatedRows);
  }

  executeSelect() {
    return this.formatResult(this.applyFilters(this.tableRows()));
  }
}

class FakeSupabaseClient {
  constructor(seed = {}) {
    this.tables = {
      payment_requests: clone(seed.payment_requests || []),
      payments: clone(seed.payments || []),
      payment_events: clone(seed.payment_events || []),
    };
  }

  from(tableName) {
    return new FakeSupabaseQuery(this, tableName);
  }

  rows(tableName) {
    return clone(this.tables[tableName] || []);
  }
}

function useFakeSupabase(seed) {
  const client = new FakeSupabaseClient(seed);
  configurePaymentsPersistenceForTests({ supabaseClient: client, enabled: true });
  return client;
}

function createStorageMock() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

test.afterEach(() => {
  configurePaymentsPersistenceForTests({ enabled: false });
  resetStoredPaymentsForTests();
});

test("admin creates payment request and Supabase row exists", async () => {
  const supabase = useFakeSupabase();

  const request = createPaymentRequest({
    customer_id: "customer-supa-1",
    order_number: "TC-SUPA-1001",
    request_type: "deposit",
    status: "open",
    amount_requested: 175,
    payment_provider: "square",
    provider_checkout_url: "https://square.test/pay",
  });

  await flushPaymentsPersistenceForTests();

  expect(supabase.rows("payment_requests")).toHaveLength(1);
  expect(supabase.rows("payment_requests")[0]).toMatchObject({
    id: request.id,
    request_number: request.request_number,
    customer_id: "customer-supa-1",
    order_number: "TC-SUPA-1001",
    amount_requested: 175,
  });
  expect(supabase.rows("payment_events").map((event) => event.event_type)).toContain("payment_request_created");
});

test("portal can read a Supabase-backed payment request", async () => {
  useFakeSupabase();

  createPaymentRequest({
    customer_id: "customer-supa-2",
    order_number: "TC-SUPA-1002",
    request_type: "balance",
    status: "open",
    amount_requested: 225,
  });
  await flushPaymentsPersistenceForTests();

  const portalPayments = getCustomerPortalPaymentData({
    orders: [{ order_number: "TC-SUPA-1002", customer_id: "customer-supa-2" }],
    customerIds: ["customer-supa-2"],
    paymentRequests: listPaymentRequests(),
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(portalPayments.paymentRequests).toHaveLength(1);
  expect(portalPayments.openPaymentRequests[0]).toMatchObject({
    order_number: "TC-SUPA-1002",
    amount_requested: 225,
  });
});

test("customer-facing Square deposit request persists before portal lookup", async () => {
  const supabase = useFakeSupabase();

  const result = await createAndSendDepositPaymentRequestForOrder(
    {
      id: "order-authoritative-square",
      order_number: "TC-SUPA-SQUARE",
      customer_id: "customer-supa-square",
      customer_name: "Supabase Square Customer",
      deposit_amount: 1,
      balance_due: 99,
      operational_visible: true,
    },
    {
      channel: "clipboard",
      body: "Deposit request with Square checkout.",
    },
    {
      staffUserId: "staff-supa-square",
      squareSendOptions: {
        sentAt: "2026-06-24T13:00:00.000Z",
        squareLinkOptions: {
          endpoint: "/square-test",
          disableFallback: true,
          fetcher: async () => ({
            ok: true,
            json: async () => ({
              mode: "production",
              payment_link: {
                id: "LNK-SUPA-SQUARE",
                url: "https://square.link/u/supa-square",
                order_id: "ORD-SUPA-SQUARE",
                status: "created",
                created_at: "2026-06-24T13:00:00.000Z",
              },
            }),
          }),
        },
      },
    }
  );

  expect(supabase.rows("payment_requests")).toHaveLength(1);
  expect(supabase.rows("payment_requests")[0]).toMatchObject({
    id: result.paymentRequest.id,
    order_number: "TC-SUPA-SQUARE",
    request_type: "deposit",
    status: "sent",
    payment_provider: "square",
    provider_checkout_url: "https://square.link/u/supa-square",
    provider_payment_link_id: "LNK-SUPA-SQUARE",
  });

  await refreshPaymentsFromSupabase();
  const portalPayments = getCustomerPortalPaymentData({
    orders: [{ order_number: "TC-SUPA-SQUARE", customer_id: "customer-supa-square" }],
    customerIds: ["customer-supa-square"],
    paymentRequests: listPaymentRequests(),
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(findPaymentRequestForOrder(portalPayments.paymentRequests, "TC-SUPA-SQUARE", "deposit")).toMatchObject({
    id: result.paymentRequest.id,
    provider_checkout_url: "https://square.link/u/supa-square",
  });
});

test("manual payment writes Supabase payment and event records", async () => {
  const supabase = useFakeSupabase();
  const request = createPaymentRequest({
    customer_id: "customer-supa-3",
    order_number: "TC-SUPA-1003",
    request_type: "deposit",
    status: "open",
    amount_requested: 150,
  });

  const payment = recordPayment({
    customer_id: "customer-supa-3",
    order_number: "TC-SUPA-1003",
    payment_request_id: request.id,
    payment_type: "deposit",
    amount: 150,
    method: "Cash",
    idempotency_key: "manual-TC-SUPA-1003-deposit",
  });

  await flushPaymentsPersistenceForTests();

  expect(supabase.rows("payments")).toHaveLength(1);
  expect(supabase.rows("payments")[0]).toMatchObject({
    id: payment.id,
    payment_request_id: request.id,
    amount: 150,
    provider: "manual",
  });
  expect(supabase.rows("payment_events").map((event) => event.event_type)).toEqual(
    expect.arrayContaining(["payment_request_created", "payment_recorded"])
  );
  expect(supabase.rows("payment_requests")[0]).toMatchObject({
    id: request.id,
    amount_paid: 150,
    status: "paid",
  });
});

test("payment list functions hydrate from Supabase rows", async () => {
  useFakeSupabase({
    payment_requests: [
      {
        id: "request-from-webhook",
        request_number: "PR-WEBHOOK",
        customer_id: "customer-supa-4",
        order_number: "TC-SUPA-1004",
        request_type: "deposit",
        status: "open",
        amount_requested: 100,
        amount_paid: 0,
        currency: "CAD",
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:00:00.000Z",
      },
    ],
    payments: [
      {
        id: "payment-from-webhook",
        payment_number: "PAY-WEBHOOK",
        customer_id: "customer-supa-4",
        order_number: "TC-SUPA-1004",
        payment_request_id: "request-from-webhook",
        status: "captured",
        amount: 100,
        currency: "CAD",
        method: "credit",
        provider: "square",
        created_at: "2026-06-01T10:01:00.000Z",
        updated_at: "2026-06-01T10:01:00.000Z",
      },
    ],
    payment_events: [
      {
        id: "event-from-webhook",
        payment_id: "payment-from-webhook",
        payment_request_id: "request-from-webhook",
        order_number: "TC-SUPA-1004",
        event_type: "square_payment_updated",
        event_source: "square_webhook",
        created_at: "2026-06-01T10:02:00.000Z",
      },
    ],
  });

  await refreshPaymentsFromSupabase();

  expect(listPaymentRequests()[0]).toMatchObject({
    id: "request-from-webhook",
    amount_paid: 100,
    status: "paid",
  });
  expect(listPayments()[0]).toMatchObject({
    id: "payment-from-webhook",
    provider: "square",
  });
  expect(listPaymentEvents()[0]).toMatchObject({
    id: "event-from-webhook",
    event_source: "square_webhook",
  });
});

test("Square webhook-written rows appear in portal and admin-facing list data", async () => {
  useFakeSupabase({
    payment_requests: [
      {
        id: "request-square-portal",
        request_number: "PR-SQUARE-PORTAL",
        customer_id: "customer-supa-5",
        order_number: "TC-SUPA-1005",
        request_type: "deposit",
        status: "paid",
        amount_requested: 80,
        amount_paid: 80,
        currency: "CAD",
        payment_provider: "square",
        created_at: "2026-06-01T11:00:00.000Z",
        updated_at: "2026-06-01T11:00:00.000Z",
      },
    ],
    payments: [
      {
        id: "payment-square-portal",
        payment_number: "PAY-SQUARE-PORTAL",
        customer_id: "customer-supa-5",
        order_number: "TC-SUPA-1005",
        payment_request_id: "request-square-portal",
        status: "captured",
        amount: 80,
        currency: "CAD",
        method: "credit",
        provider: "square",
        provider_payment_id: "square-payment-1",
        created_at: "2026-06-01T11:01:00.000Z",
        updated_at: "2026-06-01T11:01:00.000Z",
      },
    ],
    payment_events: [
      {
        id: "event-square-portal",
        payment_id: "payment-square-portal",
        payment_request_id: "request-square-portal",
        order_number: "TC-SUPA-1005",
        event_type: "square_payment_updated",
        event_source: "square_webhook",
        created_at: "2026-06-01T11:02:00.000Z",
      },
    ],
  });

  await refreshPaymentsFromSupabase();

  expect(listPaymentRequests().map((request) => request.id)).toContain("request-square-portal");
  expect(listPayments().map((payment) => payment.id)).toContain("payment-square-portal");

  const portalPayments = getCustomerPortalPaymentData({
    orders: [{ order_number: "TC-SUPA-1005", customer_id: "customer-supa-5" }],
    customerIds: ["customer-supa-5"],
    paymentRequests: listPaymentRequests(),
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(portalPayments.paymentRequests[0]).toMatchObject({ id: "request-square-portal" });
  expect(portalPayments.payments[0]).toMatchObject({ id: "payment-square-portal" });
});

test("localStorage fallback still works when Supabase is unavailable", () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorageMock();
  globalThis.window = {
    localStorage,
    sessionStorage: createStorageMock(),
    location: { hostname: "localhost" },
  };

  try {
    configurePaymentsPersistenceForTests({ enabled: false });
    resetStoredPaymentsForTests();
    const request = createPaymentRequest({
      customer_id: "customer-local-1",
      order_number: "TC-LOCAL-1001",
      request_type: "deposit",
      status: "open",
      amount_requested: 90,
    });

    expect(listPaymentRequests()[0]).toMatchObject({
      id: request.id,
      order_number: "TC-LOCAL-1001",
    });
    expect(JSON.parse(localStorage.getItem("teeCoPaymentRequests") || "[]")).toHaveLength(1);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
