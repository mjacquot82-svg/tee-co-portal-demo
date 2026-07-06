// @ts-check
import { expect, test } from "@playwright/test";
import { buildOwnerWorkflowQueues } from "../src/dashboard/ownerDashboardQueues.js";
import {
  buildDepositRequestConfirmation,
  buildProductionEmptyState,
  buildQuoteEmptyState,
  buildWorkflowActionConfirmation,
} from "../src/admin/workflowCopy.js";

test("smart dashboard queues derive actionable workflow counts and filtered destinations", () => {
  const queues = buildOwnerWorkflowQueues([
    {
      order_number: "TC-UX-201",
      request_type: "Order Request",
      operational_visible: false,
      quote_status: "Draft",
      status: "New",
    },
    {
      order_number: "TC-UX-202",
      request_type: "Order Request",
      operational_visible: false,
      quote_status: "Awaiting Approval",
      status: "New",
    },
    {
      order_number: "TC-UX-203",
      request_type: "Order Request",
      operational_visible: false,
      quote_status: "Awaiting Deposit",
      status: "New",
      deposit_required: true,
      deposit_workflow_status: "Deposit Requested",
    },
    {
      order_number: "TC-UX-204",
      request_type: "Order Request",
      operational_visible: false,
      quote_status: "Awaiting Artwork Approval",
      status: "New",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
    },
    {
      order_number: "TC-UX-205",
      operational_visible: true,
      status: "Ready For Production",
    },
    {
      order_number: "TC-UX-206",
      operational_visible: true,
      status: "Ready For Pickup",
    },
  ]);
  const byKey = Object.fromEntries(queues.map((queue) => [queue.key, queue]));

  expect(queues.map((queue) => queue.label)).toEqual([
    "New Order Requests",
    "Awaiting Customer Approval",
    "Awaiting Deposit",
    "Awaiting Artwork",
    "Ready for Production",
    "Ready for Pickup",
  ]);
  expect(byKey["new-order-requests"].count).toBe(1);
  expect(byKey["awaiting-customer-approval"].to).toBe("/admin/quotes?queue=awaiting-approval");
  expect(byKey["awaiting-deposit"].count).toBe(1);
  expect(byKey["awaiting-artwork"].to).toBe("/admin/quotes?queue=awaiting-artwork");
  expect(byKey["ready-for-production"].to).toBe("/admin/orders?status=ready-for-production");
  expect(byKey["ready-for-pickup"].count).toBe(1);
});

test("workflow confirmations include the business context owners need", () => {
  const order = {
    order_number: "TC-UX-220",
    customer_name: "ABC Construction",
    deposit_amount: 75,
  };

  expect(buildWorkflowActionConfirmation(order, { key: "move_to_production" })).toEqual({
    summary: "Order Moved to Production",
    detail: "TC-UX-220 · ABC Construction",
  });
  expect(buildDepositRequestConfirmation(order)).toBe(
    "Deposit Request Sent for TC-UX-220 · ABC Construction · $75.00"
  );
});

test("empty states describe the current workflow queue", () => {
  expect(buildProductionEmptyState("ready-for-production")).toBe(
    "No orders are waiting for production."
  );
  expect(buildProductionEmptyState("ready-for-pickup")).toBe(
    "No orders are ready for pickup."
  );
  expect(buildQuoteEmptyState("awaiting-artwork")).toBe(
    "No requests are awaiting artwork."
  );
});
