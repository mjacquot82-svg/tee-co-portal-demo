import { beforeEach, describe, expect, test } from "vitest";
import {
  recordOrderTransitionDiagnostic,
  restoreOrderTransitionDiagnostics,
} from "./orderTransitionDiagnostics";

describe("temporary order transition diagnostics", () => {
  beforeEach(() => {
    window.localStorage.removeItem("teeCoOrderTransitionDiagnostics");
    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
  });

  test("restores and merges transition events captured by another browser tab", () => {
    recordOrderTransitionDiagnostic("triggerOrderNotification:called", {
      order_number: "TC-022675",
      event_type: "new_customer_request",
    });

    window.__TEE_CO_ORDER_TRANSITION_DIAGNOSTICS__ = [];
    window.localStorage.setItem(
      "teeCoOrderTransitionDiagnostics",
      JSON.stringify([
        ...JSON.parse(
          window.localStorage.getItem("teeCoOrderTransitionDiagnostics") || "[]"
        ),
        {
          diagnostic_id: "admin-tab-ready-transition",
          stage: "didOrderEnterQuoteApprovedState:evaluated",
          order_number: "TC-022675",
          result: true,
          recorded_at: "2026-07-26T03:00:00.000Z",
        },
      ])
    );

    expect(
      restoreOrderTransitionDiagnostics().map((entry) => entry.stage)
    ).toEqual([
      "triggerOrderNotification:called",
      "didOrderEnterQuoteApprovedState:evaluated",
    ]);
  });
});
