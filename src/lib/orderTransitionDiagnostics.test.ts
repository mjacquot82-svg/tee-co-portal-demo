import { beforeEach, describe, expect, test, vi } from "vitest";

function createIndexedDbStub() {
  const records = new Map<string, Record<string, unknown>>();

  return {
    records,
    open() {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        const database = {
          objectStoreNames: { contains: () => true },
          transaction: () => ({
            objectStore: () => ({
              put(entry: Record<string, unknown>) {
                const operation: Record<string, unknown> = {};
                queueMicrotask(() => {
                  records.set(String(entry.diagnostic_id), entry);
                  operation.result = entry.diagnostic_id;
                  (operation.onsuccess as () => void)?.();
                });
                return operation;
              },
              getAll() {
                const operation: Record<string, unknown> = {};
                queueMicrotask(() => {
                  operation.result = [...records.values()];
                  (operation.onsuccess as () => void)?.();
                });
                return operation;
              },
              clear() {
                const operation: Record<string, unknown> = {};
                queueMicrotask(() => {
                  records.clear();
                  (operation.onsuccess as () => void)?.();
                });
                return operation;
              },
            }),
          }),
          close: vi.fn(),
        };
        request.result = database;
        (request.onsuccess as () => void)?.();
      });
      return request;
    },
  };
}

describe("temporary order transition diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
  });

  test("persists events in IndexedDB when localStorage writes fail", async () => {
    const indexedDB = createIndexedDbStub();
    Object.defineProperty(window, "indexedDB", { configurable: true, value: indexedDB });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const diagnostics = await import("./orderTransitionDiagnostics");

    diagnostics.recordOrderTransitionDiagnostic("updateStoredOrder:executed", {
      order_number: "TC-123456",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];

    expect(await diagnostics.restoreOrderTransitionDiagnostics()).toEqual([
      expect.objectContaining({
        stage: "updateStoredOrder:executed",
        order_number: "TC-123456",
        capture_transport: "indexedDB",
      }),
    ]);
  });
});
