// @ts-check
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  getCustomerPaymentDueLabel,
  getEstimatedBalanceAfterPayment,
} from "../src/customer-portal/customerPortalPayments.js";
import {
  buildPortalOrderCardSummary,
  buildPortalOrderTimeline,
  resolveCustomerQuoteApprovalStatus,
  resolveCustomerQuoteStatus,
  resolvePortalNextAction,
  resolvePortalNextActionDetails,
  resolvePortalOrderAttention,
} from "../src/customer-portal/portalOrderDetail.js";

test("collapsed order summaries expose ownership and concurrent customer needs", () => {
  const summary = buildPortalOrderCardSummary(
    {
      order_number: "TC-SUMMARY-2001",
      quote_status: "Awaiting Deposit",
      artwork_requirement: "upload_later",
      artwork_status: "Missing",
    },
    [{ id: "payment-summary-1", request_type: "deposit", status: "sent" }]
  );

  expect(summary.customerActionRequired).toBe(true);
  expect(summary.ownership.label).toContain("Your action:");
  expect(summary.paymentOutstanding).toBe(true);
  expect(summary.artworkRequired).toBe(true);
  expect(summary.indicators.map((indicator) => indicator.label)).toEqual([
    "Payment outstanding",
    "Artwork required",
  ]);
});

test("collapsed order summaries identify Tee & Co work and pickup readiness", () => {
  const inProduction = buildPortalOrderCardSummary({ status: "Printing" }, []);
  expect(inProduction).toMatchObject({
    customerActionRequired: false,
    teeAndCoWorking: true,
    ownership: { label: "Tee & Co is working on your order" },
  });

  const ready = buildPortalOrderCardSummary({ status: "Ready For Pickup" }, []);
  expect(ready).toMatchObject({
    customerActionRequired: true,
    readyForPickup: true,
    ownership: { label: "Your action: Pick up your order" },
  });
  expect(ready.indicators).toContainEqual({
    key: "pickup",
    label: "Ready for pickup",
    tone: "success",
  });
});

test("buildPortalOrderTimeline maps unified customer milestones", () => {
  const order = {
    order_number: "TC-DETAIL-1001",
    created_at: "2026-06-01T10:00:00.000Z",
    artwork_files: [{ id: "art-1" }],
    quote_status: "Approved",
    approved_at: "2026-06-02T10:00:00.000Z",
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
  };
  const paymentRequests = [{ id: "pr-1", status: "sent" }];
  const payments = [{ id: "pay-1", status: "captured", amount: 150 }];

  const timeline = buildPortalOrderTimeline(order, paymentRequests, payments, []);

  expect(timeline.map((step) => step.label)).toEqual([
    "Request Submitted",
    "Artwork Uploaded",
    "Pricing Review Started",
    "Quote Approved",
    "Payment Requested",
    "Payment Received",
    "Production Started",
    "Ready For Pickup",
    "Completed",
  ]);
  expect(
    timeline.filter((step) => step.complete).map((step) => step.label)
  ).toEqual([
    "Request Submitted",
    "Artwork Uploaded",
    "Pricing Review Started",
    "Quote Approved",
    "Payment Requested",
    "Payment Received",
    "Production Started",
    "Ready For Pickup",
  ]);
});

test("customer quote presentation distinguishes preparation from completed milestones", () => {
  const draftOrder = { quote_status: "Draft" };

  expect(resolveCustomerQuoteStatus(draftOrder)).toBe("Tee & Co is preparing your quote");
  expect(resolveCustomerQuoteApprovalStatus(draftOrder)).toBe("Not ready for approval");
  expect(buildPortalOrderTimeline(draftOrder)[2]).toEqual({
    label: "Pricing Review Started",
    complete: true,
  });

  expect(resolveCustomerQuoteStatus({ quote_status: "Awaiting Approval" })).toBe(
    "Waiting for your approval"
  );
  expect(resolveCustomerQuoteApprovalStatus({ quote_status: "Awaiting Approval" })).toBe(
    "Your approval is needed"
  );
});

test("order detail explains when no payment has been requested", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalOrderDetail.jsx"),
    "utf8"
  );

  expect(source).toContain("No payment is required right now.");
  expect(source).toContain("Tee & Co has not requested payment.");
  expect(source).toContain("Tee & Co is confirming your schedule");
  expect(source).not.toContain("Scheduling in progress");
});

test("customer payment presentation prioritizes the active amount due", () => {
  const depositRequest = {
    request_type: "deposit",
    amount_requested: 1,
    amount_paid: 0,
  };

  expect(getCustomerPaymentDueLabel(depositRequest)).toBe("Deposit Due");
  expect(getEstimatedBalanceAfterPayment(100, depositRequest)).toBe(99);
  expect(getCustomerPaymentDueLabel({ request_type: "balance" })).toBe("Amount Due Today");
});

test("resolvePortalNextAction prioritizes existing customer workflows", () => {
  const artworkOrder = {
    order_number: "TC-DETAIL-1002",
    artwork_requirement: "upload_later",
    artwork_approval_status: "Pending Review",
    quote_status: "Awaiting Approval",
  };
  expect(resolvePortalNextAction(artworkOrder, [])).toBe("Upload Artwork");

  const approvalOrder = {
    order_number: "TC-DETAIL-1003",
    artwork_approval_required: false,
    quote_status: "Awaiting Approval",
  };
  expect(resolvePortalNextAction(approvalOrder, [])).toBe("Approve Quote");

  const paymentOrder = {
    order_number: "TC-DETAIL-1004",
    artwork_approval_required: false,
    quote_status: "Approved",
    status: "Ready For Production",
  };
  expect(
    resolvePortalNextAction(paymentOrder, [{ id: "pr-1", status: "sent", amount_requested: 100 }])
  ).toBe("View Payment Request");
});

test("resolvePortalNextActionDetails maps direct customer action routes", () => {
  const artworkOrder = {
    order_number: "TC-DETAIL-2000",
    artwork_requirement: "upload_later",
    artwork_approval_status: "Pending Review",
  };
  expect(resolvePortalNextActionDetails(artworkOrder, [])).toEqual({
    actionType: "artwork",
    label: "Upload Artwork",
    to: "/portal/orders/TC-DETAIL-2000/artwork",
  });

  const quoteOrder = { order_number: "TC-DETAIL-2001", quote_status: "Sent" };
  expect(resolvePortalNextActionDetails(quoteOrder, [])).toEqual({
    actionType: "quote_review",
    label: "Review Quote",
    to: "/quote/TC-DETAIL-2001",
  });

  const approvalOrder = { order_number: "TC-DETAIL-2002", quote_status: "Awaiting Approval" };
  expect(resolvePortalNextActionDetails(approvalOrder, [])).toEqual({
    actionType: "quote_approval",
    label: "Approve Quote",
    to: "/approval/TC-DETAIL-2002",
  });

  const depositOrder = { order_number: "TC-DETAIL-2003", quote_status: "Approved" };
  expect(
    resolvePortalNextActionDetails(depositOrder, [{ id: "pr-1", request_type: "deposit", status: "sent" }])
  ).toEqual({
    actionType: "payment_sent_confirmation",
    label: "Mark Payment Sent",
    to: "/portal/orders/TC-DETAIL-2003/deposit",
  });

  expect(
    resolvePortalNextActionDetails(depositOrder, [
      {
        id: "pr-square-deposit",
        request_type: "deposit",
        status: "sent",
        provider_checkout_url: "https://square.link/u/deposit",
      },
    ])
  ).toEqual({
    actionType: "payment_request",
    label: "View Payment Request",
    to: "/portal/payments/pr-square-deposit",
  });

  const balanceOrder = { order_number: "TC-DETAIL-2004", quote_status: "Approved" };
  expect(
    resolvePortalNextActionDetails(balanceOrder, [{ id: "pr-2", request_type: "balance", status: "sent" }])
  ).toEqual({
    actionType: "payment_request",
    label: "View Payment Request",
    to: "/portal/payments/pr-2",
  });

  const productionOrder = { order_number: "TC-DETAIL-2005", status: "Printing" };
  expect(resolvePortalNextActionDetails(productionOrder, [])).toEqual({
    actionType: "order_progress",
    label: "View Order Progress",
    to: "/portal/orders/TC-DETAIL-2005#activity-timeline",
  });
});

test("resolvePortalOrderAttention returns action-first summary labels", () => {
  const quoteApprovalOrder = {
    order_number: "TC-SUMMARY-1001",
    quote_status: "Awaiting Approval",
  };
  expect(resolvePortalOrderAttention(quoteApprovalOrder, [])).toEqual({
    tone: "warning",
    label: "Approve Quote",
    requiresAction: true,
  });

  const depositOrder = { order_number: "TC-SUMMARY-1002", quote_status: "Approved" };
  expect(
    resolvePortalOrderAttention(depositOrder, [
      {
        id: "pr-deposit",
        request_type: "deposit",
        status: "sent",
        provider_checkout_url: "https://square.link/u/deposit",
      },
    ])
  ).toEqual({
    tone: "warning",
    label: "Pay Deposit",
    requiresAction: true,
  });

  const balanceOrder = { order_number: "TC-SUMMARY-1003", quote_status: "Approved" };
  expect(
    resolvePortalOrderAttention(balanceOrder, [
      { id: "pr-balance", request_type: "balance", status: "sent" },
    ])
  ).toEqual({
    tone: "warning",
    label: "Pay Balance",
    requiresAction: true,
  });

  const productionOrder = { order_number: "TC-SUMMARY-1004", status: "Printing" };
  expect(resolvePortalOrderAttention(productionOrder, [])).toEqual({
    tone: "info",
    label: "In Production",
    requiresAction: false,
  });
});
