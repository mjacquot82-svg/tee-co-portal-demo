import { expect, test } from "@playwright/test";

import {
  PERSISTENCE_MODES,
  PersistenceModeError,
  canUseLocalPersistenceFallback,
  resolvePersistenceMode,
} from "../src/lib/persistenceMode";
import { createCrudService } from "../src/services/createCrudService";

class FakeSupabaseQuery {
  constructor(result) {
    this.result = result;
  }

  select() {
    return this;
  }

  order() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return this;
  }

  single() {
    return this;
  }

  insert() {
    return this;
  }

  update() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function createFakeClient(result) {
  return {
    from() {
      return new FakeSupabaseQuery(result);
    },
  };
}

function createLocalStore() {
  const calls = [];
  return {
    calls,
    list() {
      calls.push("list");
      return [{ id: "local-list" }];
    },
    getById() {
      calls.push("get");
      return { id: "local-get" };
    },
    create(record) {
      calls.push("create");
      return { ...record, source: "local" };
    },
    update(identifier, updates) {
      calls.push("update");
      return { id: identifier, ...updates, source: "local" };
    },
  };
}

test("resolvePersistenceMode defaults production builds to production persistence", () => {
  expect(resolvePersistenceMode({ PROD: true, MODE: "production" })).toBe(
    PERSISTENCE_MODES.production
  );
});

test("explicit demo persistence mode allows local fallback", () => {
  const mode = resolvePersistenceMode({
    PROD: true,
    MODE: "production",
    VITE_TEE_CO_PERSISTENCE_MODE: "demo",
  });

  expect(mode).toBe(PERSISTENCE_MODES.demo);
  expect(canUseLocalPersistenceFallback(mode)).toBe(true);
});

test("createCrudService falls back locally in development when Supabase is unavailable", async () => {
  const local = createLocalStore();
  const service = createCrudService({
    table: "orders",
    local,
    supabaseClient: null,
    supabaseConfigured: false,
    persistenceMode: PERSISTENCE_MODES.development,
  });

  const result = await service.create({ id: "order-1" });

  expect(result).toEqual({ id: "order-1", source: "local" });
  expect(local.calls).toEqual(["create"]);
});

test("createCrudService fails loudly in production when Supabase is unavailable", async () => {
  const local = createLocalStore();
  const service = createCrudService({
    table: "orders",
    local,
    supabaseClient: null,
    supabaseConfigured: false,
    persistenceMode: PERSISTENCE_MODES.production,
  });

  let thrownError = null;
  await service.create({ id: "order-1" }).catch((error) => {
    thrownError = error;
  });

  expect(thrownError).toBeInstanceOf(PersistenceModeError);
  expect(thrownError.details).toMatchObject({
    table: "orders",
    operation: "create",
  });
  expect(local.calls).toEqual([]);
});

test("createCrudService fails loudly in production when Supabase returns an error", async () => {
  const local = createLocalStore();
  const service = createCrudService({
    table: "orders",
    local,
    supabaseClient: createFakeClient({
      data: null,
      error: new Error("remote write failed"),
    }),
    supabaseConfigured: true,
    persistenceMode: PERSISTENCE_MODES.production,
  });

  let thrownError = null;
  await service.update("order-1", { status: "In Production" }).catch((error) => {
    thrownError = error;
  });

  expect(thrownError).toBeInstanceOf(PersistenceModeError);
  expect(thrownError.details).toMatchObject({
    table: "orders",
    operation: "update",
  });
  expect(thrownError.cause.message).toBe("remote write failed");
  expect(local.calls).toEqual([]);
});
