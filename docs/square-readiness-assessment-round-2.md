# Square Readiness Assessment – Round 2

**Date:** June 24, 2026  
**Prepared by:** GitHub Copilot  
**Status:** Follow-Up Review  
**Closes:** [#33](https://github.com/mjacquot82-svg/tee-co-portal-demo/issues/33)

---

## Executive Summary

This assessment evaluates the Tee & Co Portal's readiness to begin live Square webhook integration, following the completion of Phase 1 Square work. All seven Round 1 prerequisites have been resolved. The system has a well-structured, idempotent payment foundation. The primary remaining gap is the absence of a Square webhook receiver and the associated inbound event handling pipeline.

**Round 2 Overall Square Readiness Score: 6.5 / 10**  
*(Up from an estimated 3.5 / 10 at Round 1 baseline)*

---

## 1. Updated Square Readiness Scores

| Dimension                     | Round 1 | Round 2 | Δ   |
|-------------------------------|---------|---------|-----|
| Payment Architecture          | 3 / 10  | 7 / 10  | +4  |
| Customer Readiness            | 2 / 10  | 8 / 10  | +6  |
| Owner Readiness               | 2 / 10  | 8 / 10  | +6  |
| Staff Readiness               | 3 / 10  | 6 / 10  | +3  |
| Notification Readiness        | 3 / 10  | 5 / 10  | +2  |
| Production Readiness          | 2 / 10  | 6 / 10  | +4  |
| **Overall Square Readiness**  | **3.5** | **6.5** | **+3** |

### Payment Architecture Readiness — 7 / 10

The canonical payment state layer (`src/orders/canonicalState.js`) and the payments store (`src/lib/paymentsStore.js`) represent a mature, well-tested foundation. Payment requests, payments, and payment events are all modelled distinctly with full audit trails.

**Strengths:**
- Canonical `deriveOrderPaymentState()` and `deriveOrderWorkflowState()` handle both modern canonical records and legacy `payment_history` arrays
- Idempotency is enforced at the Square payment link level via `square-payment-link:${id}` keys
- `normalizePaymentRequest()` correctly models all provider fields: `payment_provider`, `provider_checkout_url`, `provider_order_id`, `provider_payment_link_id`, `metadata.square_payment_link.*`
- `syncPaymentRequestTotals()` keeps `amount_paid` and `status` in sync when payments are recorded

**Gaps:**
- No webhook inbound handler exists to automatically settle a payment request when Square fires `payment.completed`
- No automated `recordPayment()` call on webhook receipt; all payment recording is still manual-staff-initiated
- `provider_status` field on payment requests is never updated post-creation (stays `"created"` indefinitely)
- No refund or void pathway in the canonical model

---

### Customer Readiness — 8 / 10

The customer portal is the most complete dimension of Phase 1. The "Pay Now" experience is fully wired end-to-end.

**Strengths:**
- `hasProviderCheckoutUrl()` correctly gates the Pay Now button to only show when `provider_checkout_url` is a valid absolute URL
- Pay Now opens Square checkout in a new tab (`target="_blank"`) — correct for hosted checkout
- Payment status labels (`Awaiting Payment`, `Processing`, `Partially Paid`, `Paid`, `Cancelled`) are customer-friendly and driven by canonical data
- Payment detail page at `/portal/payments/:id` shows provider name, checkout URL, payment timeline

**Gaps:**
- No post-payment return/confirmation route — after the customer pays on Square and Square redirects back, there is no landing page to show success/confirmation
- Payment status does not update automatically after the customer pays; it requires a staff member to manually record the payment or a webhook to fire
- No customer-visible "Payment received" confirmation within the portal itself
- The legacy deposit route (`/portal/orders/:orderNumber/deposit`) still coexists with the new Pay Now flow — a customer may encounter both paths

---

### Owner Readiness — 8 / 10

The owner "Send Now" workflow is complete and correctly sequenced.

**Strengths:**
- `handleNextAction("mark_payment_request_sent")` in `PaymentRequestDetail.jsx`:
  1. Creates the Square payment link via `createSquarePaymentLink()`
  2. Persists all provider metadata via `buildSquarePaymentRequestUpdates()`
  3. Records `square_payment_link_created` payment event
  4. Updates payment request status to `"sent"` with `sent_at` timestamp
  5. Records `payment_request_sent` payment event
- `deriveOwnerPaymentRequestNextAction()` drives the correct CTA: "Send Now" when unsent, "Follow up on payment" when sent
- `deriveOwnerOrderNextAction()` correctly surfaces "Create deposit payment request" and "Send or follow up on payment request" actions
- Square metadata (link URL, link ID, order ID, created_at) is visible in the Payment Request Detail view

**Gaps:**
- There is no owner-facing notification when a Square payment is received (webhook not yet implemented)
- Owner must manually record payment once customer pays, until webhooks are live
- No UI indication of whether the Square link has been clicked or is still unvisited
- No "Resend / Regenerate link" action if the customer cannot find the original email

---

### Staff Readiness — 6 / 10

**Strengths:**
- `STAFF_NOTIFICATION_TYPES.paymentHold` exists for blocking scenarios
- Staff notification store (`teeCoStaffNotifications`) is in place with 9 types and priority levels
- Payment event types include `square_payment_link_created` and `payment_request_sent` for audit purposes

**Gaps:**
- No staff notification fires automatically when a Square webhook payment is received
- `STAFF_NOTIFICATION_TYPES` does not include a Square-specific `payment_received` event type
- Staff still discover payment receipt through manual review of the financial workspace rather than push notification
- No webhook-triggered staff alert for payment failure or cancellation

---

### Notification Readiness — 5 / 10

**Strengths:**
- 11 notification templates exist, including `payment_request_created`, `deposit_requested`, and `payment_received`
- `{{payment_link}}` merge field correctly resolves from `paymentRequest.provider_checkout_url`, so the Square checkout URL will appear in customer notifications
- `triggerNotificationEvent()` fires on `createPaymentRequest()` and `recordPayment()` automatically
- Notification activity log (`teeCoNotificationActivity`) stores rendered content for audit
- Templates are configurable at `/admin/settings/notifications`

**Gaps:**
- **All notification delivery is simulated.** `triggerNotificationEvent()` stores records in localStorage but does not send email or SMS to any real recipient
- No `payment_received_square` template to distinguish Square online payments from manual e-transfers
- Notification triggered on `createPaymentRequest()` fires at creation time, not when the link is sent — `provider_checkout_url` is empty at creation, so `{{payment_link}}` resolves to a placeholder
- No webhook-triggered notification for Square `payment.failed` or `payment.canceled` events
- No delivery integration (SendGrid, Twilio, etc.) wired to the notification delivery service

---

### Production Readiness — 6 / 10

**Strengths:**
- `SQUARE_ENVIRONMENT` toggle correctly switches between `https://connect.squareupsandbox.com` and `https://connect.squareup.com`
- `.env.example` correctly lists `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`
- Netlify function correctly returns HTTP 501 if credentials are missing (safe fail)
- `VITE_SQUARE_ALLOW_LOCAL_FALLBACK=false` is the documented production default

**Gaps:**
- `SQUARE_WEBHOOK_SIGNATURE_KEY` is absent from `.env.example` — required before any webhook endpoint is deployed
- No webhook Netlify function exists yet
- No HMAC-SHA256 signature validation infrastructure
- No replay-attack protection (idempotency key checking on inbound webhooks)
- Square Version header is pinned to `2024-06-04` — should be reviewed when implementing webhooks

---

## 2. Comparison Against Round 1 Required Items

The following items were identified as required before Square integration could begin:

| Round 1 Required Item                               | Status               | Notes |
|-----------------------------------------------------|----------------------|-------|
| Canonical payment request data model                | ✅ Resolved          | `paymentsStore.js` — full model with provider fields |
| Payment events audit trail                          | ✅ Resolved          | `recordPaymentEvent()` called on every state change |
| Square payment link creation service                | ✅ Resolved          | `src/services/squareService.js` |
| Netlify Square payment-link function                | ✅ Resolved          | `netlify/functions/square-payment-link.js` |
| Provider metadata persistence on payment request    | ✅ Resolved          | `payment_provider`, `provider_checkout_url`, `provider_payment_link_id`, `provider_order_id`, `metadata.square_payment_link.*` |
| Owner "Send Now" workflow                           | ✅ Resolved          | `PaymentRequestDetail.jsx` — creates link, records events, marks sent |
| Customer portal Pay Now experience                  | ✅ Resolved          | `CustomerPortalPayments.jsx` + `CustomerPortalPaymentRequestDetail.jsx` |
| Idempotency key strategy                            | ✅ Resolved          | `square-payment-link:${paymentRequest.id}` pattern |
| Production/sandbox environment switching            | ✅ Resolved          | `SQUARE_ENVIRONMENT` env var in Netlify function |
| Canonical payment & workflow state layer            | ✅ Resolved          | `canonicalState.js` — `deriveOrderPaymentState()` + `deriveOrderWorkflowState()` |
| Production gating tied to canonical state           | ✅ Resolved          | `workflowGating.js` — `isDepositRequirementSatisfied()` uses canonical + legacy |
| `{{payment_link}}` merge field in notifications     | ✅ Resolved          | `notificationDeliveryService.js` — resolves from `paymentRequest.provider_checkout_url` |

**All 12 Round 1 required items are resolved.**

---

## 3. New Issues Discovered in Round 2

### Issue 1 — `provider_status` is never updated post-creation
**File:** `src/lib/paymentsStore.js`, `src/services/squareService.js`  
**Severity:** Medium  
The `provider_status` field on payment requests is set to `"created"` when the Square link is created and is never updated again. Once webhooks are implemented, a handler must update this field to `"completed"`, `"failed"`, or `"canceled"` based on webhook events.

### Issue 2 — Notification fires before payment link is attached
**File:** `src/lib/paymentsStore.js` lines 244–263  
**Severity:** Medium  
`createPaymentRequest()` fires `triggerNotificationEvent(NOTIFICATION_TYPES.paymentRequestCreated)` immediately. At creation time, `provider_checkout_url` is often empty (the Square link is created during the "Send Now" action, not at creation). Customers receiving the notification at creation time may find an empty `{{payment_link}}` merge field.

### Issue 3 — No Square webhook receiver
**Severity:** High — Blocking for Phase 2  
There is no `netlify/functions/square-webhook.js` handler. Square cannot deliver `payment.completed`, `payment.failed`, or `payment.canceled` events to the system. This is the single largest gap preventing Phase 2.

### Issue 4 — No webhook signature validation infrastructure
**Severity:** High — Security requirement  
No HMAC-SHA256 validation utility exists. `SQUARE_WEBHOOK_SIGNATURE_KEY` is absent from `.env.example`. Without signature validation, the webhook endpoint would accept forged payloads.

### Issue 5 — No post-Square-payment return URL
**Severity:** Medium  
`buildSquarePayload()` in the Netlify function does not set `checkout_options.redirect_url`. After a customer pays on Square, they remain on Square's default confirmation page with no route back to the Tee & Co portal. This creates a broken post-payment experience.

### Issue 6 — `{{payment_link}}` resolves to a placeholder at notification-trigger time
**Severity:** Medium (related to Issue 2)  
When `triggerNotificationEvent(NOTIFICATION_TYPES.depositRequested)` fires during `createPaymentRequest()`, `paymentRequest.provider_checkout_url` is an empty string. The fallback in `notificationDeliveryService.js` (lines 95–98) resolves to a local-URL pattern (`https://portal.teeandco.local/deposit/${orderNumber}`) — a placeholder that is never valid in production.

### Issue 7 — Legacy deposit portal route coexists with Square Pay Now
**File:** `src/customer-portal/CustomerPortalDeposit.jsx`, `src/lib/depositPaymentProviders.js`  
**Severity:** Low — Technical debt  
The old `/portal/orders/:orderNumber/deposit` route still exists and is still driven by `isDepositActionRequired()`, which reads legacy order fields. A customer could encounter both the new Pay Now button and the old deposit page simultaneously.

### Issue 8 — No payment retry or link regeneration mechanism
**Severity:** Low-Medium  
If a Square payment link expires or a customer loses the email, there is no owner action to regenerate or resend the link. The "Send Now" button is only available while `status !== "sent"` — once marked sent, no "Resend" CTA exists.

---

## 4. Feature Readiness Checklist

| Feature                              | Status         | Notes |
|--------------------------------------|----------------|-------|
| Customer Pay Now experience          | ✅ Ready        | Button shown, correct URL, opens Square checkout |
| Owner payment request workflow       | ✅ Ready        | Send Now creates link, marks sent, records events |
| Provider payment link storage        | ✅ Ready        | All 5 provider fields persisted + `metadata.square_payment_link.*` |
| Payment link lifecycle (creation)    | ✅ Ready        | Link created via Netlify → Square API with idempotency |
| Payment link lifecycle (completion)  | ❌ Not Ready    | Requires Square webhook to auto-settle |
| Canonical payment state              | ✅ Ready        | `deriveOrderPaymentState()` handles all cases |
| Production payment gating            | ✅ Ready        | `isDepositRequirementSatisfied()` uses canonical + legacy fallback |

---

## 5. Everything Still Required Before Webhook Implementation

The following must be in place before a Square webhook endpoint can be safely deployed:

1. **`SQUARE_WEBHOOK_SIGNATURE_KEY` environment variable** — Add to `.env.example` and Netlify environment. Required to validate all inbound webhook payloads.

2. **`netlify/functions/square-webhook.js`** — A POST handler that:
   - Validates the `x-square-hmacsha256-signature` header using HMAC-SHA256
   - Parses the event type from `event.data.object.type`
   - Routes to per-event handlers based on event type
   - Returns `200 OK` immediately to acknowledge receipt (Square retries on non-200)

3. **Idempotency protection on webhook receipt** — Before processing, check `paymentEvents` for a prior event with the same Square event ID to prevent double-processing on Square retries.

4. **`handlePaymentCompleted(squarePayment)` handler** — Maps Square `payment.completed` to:
   - `recordPayment()` with `provider: "square"`, `provider_payment_id: squarePayment.id`
   - `syncPaymentRequestTotals()` on the matching payment request
   - `triggerNotificationEvent(NOTIFICATION_TYPES.paymentReceived)` for the customer

5. **`handlePaymentFailed(squarePayment)` handler** — Maps Square `payment.failed`/`payment.canceled` to:
   - `updatePaymentRequest()` with `provider_status: "failed"` or `"canceled"`
   - `recordPaymentEvent()` with `event_type: "payment_failed"` or `"payment_canceled"`

6. **Square payment → payment request matching logic** — The webhook payload includes `order.reference_id` which maps to `paymentRequest.id` (set in `buildSquarePayload()` via `input.payment_request_id`). This matching must be validated end-to-end.

7. **Return URL in Square checkout options** — `checkout_options.redirect_url` in `buildSquarePayload()` should point to a portal confirmation route (e.g., `/portal/payments/:id/confirmation`) so customers land back in the portal after paying.

8. **Fix notification timing (Issue 2)** — `triggerNotificationEvent` for `paymentRequestCreated` and `depositRequested` should fire at "Send Now" time (when the link is available), not at creation time.

---

## 6. Webhook Event Readiness

| Event                  | Infrastructure Ready? | Handler Exists? | Assessment |
|------------------------|-----------------------|-----------------|------------|
| `payment.completed`    | Partial               | ❌ No           | `recordPayment()` + `syncPaymentRequestTotals()` exist; handler not wired |
| `payment.failed`       | Partial               | ❌ No           | `FAILED` state exists in `OWNER_PAYMENT_STATES`; handler not wired |
| `payment.canceled`     | Partial               | ❌ No           | `canceled` status in `FAILED_REQUEST_STATUSES`; handler not wired |
| `payment.processing`   | Partial               | ❌ No           | `AWAITING_VERIFICATION` state exists; handler not wired |
| Payment retry          | None                  | ❌ No           | No retry pathway in payment model; retry requires new link or manual re-open |

**Summary:** The canonical state layer is pre-configured to represent all five payment states. None have an inbound webhook handler. The data model can absorb webhook-driven state changes without structural changes — only the handler functions need to be written.

---

## 7. Remaining Legacy Payment / Deposit Dependencies

| Legacy Field / Pattern                | Location | Impact |
|---------------------------------------|----------|--------|
| `order.deposit_workflow_status`       | `workflowGating.js:85–116`, `canonicalState.js:302–312` | Still read as fallback when no canonical payment records exist. Required for backward compatibility with existing orders. |
| `order.deposit_required` / `order.deposit_amount` | `workflowGating.js:88–91`, `canonicalState.js:182–191` | Drive `hasDepositRequirement()`. Can remain as metadata; does not block webhook work. |
| `order.payment_history[]`             | `canonicalState.js:117–129`, `paymentsStore.js:442–523` | Used as fallback via `getLegacyPaymentHistory()`. `backfillOrderPaymentsToPayments()` migrates them to canonical. Not blocking. |
| `order.total_paid` / `order.amount_paid` | `canonicalState.js:158–163` | Fallback when no canonical payments exist. Harmless. |
| `/portal/orders/:orderNumber/deposit` route | `CustomerPortalDeposit.jsx`, `depositPaymentProviders.js` | Legacy deposit portal page. Coexists with Pay Now but could confuse customers. Should be deprecated after webhooks confirm Square settlement. |
| `isDepositActionRequired()` in `depositPaymentProviders.js` | Customer portal deposit route logic | Reads legacy order fields rather than canonical state. Should be updated to read canonical state post-Phase 2. |

**Assessment:** None of these legacy dependencies block Phase 2 implementation. They represent a planned migration path.

---

## 8. Next Implementation Phase Recommendation

### Recommended: Phase 2 – Square Webhooks

**Rationale:**

1. The canonical payment model already has `FAILED`, `AWAITING_VERIFICATION`, `AWAITING_PAYMENT`, `DEPOSIT_RECEIVED`, and `PAID` states — all designed to absorb webhook-driven changes.
2. `recordPayment()` and `syncPaymentRequestTotals()` can process a Square `payment.completed` webhook without model changes.
3. Idempotency keys and `paymentsStore` deduplication logic will correctly absorb webhook retries.
4. The Netlify function infrastructure is already proven (the payment link function deploys successfully).
5. The `order.reference_id` → `paymentRequest.id` mapping in `buildSquarePayload()` is the correct webhook correlation key.

**Before starting Phase 2, two prerequisite fixes are recommended:**

- **Fix notification timing** (Issues 2 & 6): Move `paymentRequestCreated` and `depositRequested` notification triggers from `createPaymentRequest()` to the "Send Now" handler, so `{{payment_link}}` is always populated when the customer receives the message.
- **Add `redirect_url` to Square checkout options** (Issue 5): Set the return URL before live payments begin, so customers land back in the portal after paying.

These two fixes are small and surgical. They eliminate the two most customer-visible gaps in the current Phase 1 implementation.

---

## 9. Final Recommendation

### Mostly Ready For Square Phase 2

**Reasoning:**

The Tee & Co Portal has made substantial and well-structured progress since Round 1. All Phase 1 implementation targets are complete. The canonical payment state layer, payment link creation service, provider metadata persistence, owner Send Now workflow, and customer Pay Now experience are all production-quality and well-tested.

The system is **not yet fully ready** for Phase 2 because:

1. **No webhook receiver exists.** The single most critical Phase 2 prerequisite — `netlify/functions/square-webhook.js` with HMAC-SHA256 signature validation — is absent.
2. **Notifications fire at the wrong time.** Payment link notifications fire at request creation rather than at send time, meaning `{{payment_link}}` may be empty in customer-facing messages.
3. **No post-payment return URL.** Customers who complete a Square payment are left on Square's confirmation page with no route back to the portal.

None of these are architectural blockers. The data model, state machine, and store infrastructure are all ready to absorb webhook events. Phase 2 is well-defined: write the webhook handler, fix notification timing, and add the return URL.

**Confidence in Phase 2 success: High.** The foundational work is sound. Phase 2 is additive.

---

## Summary Table

| Area                              | Ready? | Blocking for Webhooks? |
|-----------------------------------|--------|------------------------|
| Payment request data model        | ✅ Yes | —                      |
| Payment events / audit trail      | ✅ Yes | —                      |
| Canonical payment state           | ✅ Yes | —                      |
| Production gating                 | ✅ Yes | —                      |
| Square payment link creation      | ✅ Yes | —                      |
| Owner Send Now workflow           | ✅ Yes | —                      |
| Customer Pay Now experience       | ✅ Yes | —                      |
| Idempotency enforcement           | ✅ Yes | —                      |
| Sandbox/production env switching  | ✅ Yes | —                      |
| Webhook receiver function         | ❌ No  | ✅ Yes — blocking        |
| Webhook signature validation      | ❌ No  | ✅ Yes — blocking        |
| Inbound payment settlement        | ❌ No  | ✅ Yes — blocking        |
| Post-payment return URL           | ❌ No  | Partial                 |
| Notification delivery (real)      | ❌ No  | No (Phase 3)            |
| Notification timing fix           | ❌ No  | Pre-Phase 2 recommended |
| Legacy deposit route deprecation  | ❌ No  | No (Phase 3 cleanup)    |
