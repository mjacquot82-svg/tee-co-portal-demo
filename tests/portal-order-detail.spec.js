// @ts-check
import { test, expect } from "@playwright/test";
import {
  buildPortalOrderTimeline,
  resolvePortalNextAction,
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
