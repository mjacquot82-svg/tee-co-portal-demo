// @ts-check
import { test, expect } from "@playwright/test";
import {
  buildPortalOrderTimeline,
  resolvePortalNextAction,
  resolvePortalNextActionDetails,
} from "../src/customer-portal/portalOrderDetail.js";

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
    "Quote Created",
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
    "Quote Created",
    "Quote Approved",
    "Payment Requested",
    "Payment Received",
    "Production Started",
    "Ready For Pickup",
  ]);
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
