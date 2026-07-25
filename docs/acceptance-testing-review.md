# Acceptance Testing Review

This is the living source of truth for production acceptance findings, priorities, and remaining validation work. Update it as each workflow is tested or a finding changes status.

## Document History

- Initial acceptance review created after the first customer and Admin workflow validation sessions.
- Updated after customer ordering, portal navigation, order tracking, and Admin intake findings were consolidated.
- Updated after deposit-request and Square payment-link findings identified the current payment2 blocker.
- Updated with validated UX strengths, stable tracking IDs, business-impact priorities, and a qualitative release-readiness summary.
- Future updates should append new entries rather than replace previous history.

# Executive Summary

The application supports the core Tee & Co customer-to-admin order lifecycle. Acceptance testing has validated authentication, storefront ordering, the authenticated customer portal, customer order tracking, the Admin dashboard, request approval, artwork requests, deposit requests, Square payment-link generation in the established production path, and presentation of payment requests in the customer payment portal.

The intentional customer ordering architecture is currently a two-stage handoff: the public order preview saves a pending selection, and the authenticated request form performs the actual order creation. This workflow is functional, although its wording and progression need later UX refinement.

Validated capabilities:

- Customer ordering workflow, including confirmation and generated order number.
- Authentication and return into the authenticated customer portal.
- Customer portal access and order tracking.
- Submitted-order visibility and detail access.
- Admin dashboard and customer-request intake.
- Order approval.
- Artwork-request handling.
- Deposit-request creation.
- Square payment-link generation in the previously established live production flow.
- Customer payment portal visibility and Pay Now routing behavior.

Not yet fully validated end to end:

- A successful new live Square payment from the current acceptance order.
- Square webhook receipt and reconciliation for that payment.
- Automatic transition to Deposit Received.
- Release to and progression through production.
- Ready for Pickup.
- Order completion.

# Validated UX Strengths

These strengths were confirmed during acceptance testing and should be intentionally preserved during future UX work.

## Admin Dashboard

The Admin dashboard effectively answers the operational question: **“What should Teresa work on next?”** It presents incoming work clearly and provides a useful overview of the business workflow.

Future improvements should build on this operational model rather than redesigning the dashboard unnecessarily.

## Customer Order Detail

The expanded customer order detail page is one of the strongest parts of the application. Once opened, it clearly communicates:

- Timeline.
- Payment status.
- Artwork status.
- Production progress.
- Next customer actions.

Future customer UX work should focus primarily on helping customers discover and open this view rather than redesigning the expanded detail experience itself.

# Fixed During Acceptance Testing

## Production authentication and canonical-domain handling

- **Description:** Authentication callbacks and customer account recovery needed to consistently return to the production domain.
- **Root cause:** Site URLs and authentication redirect targets were not consistently derived from one canonical production origin; customer recovery handling was incomplete.
- **Resolution:** Added canonical URL handling, production-domain redirects, email confirmation and password-recovery flows, and regression coverage.
- **Commit:** `eacd760` — `fix(auth): complete production domain migration`

## Customer order lost its customer linkage

- **Description:** A customer-submitted order could be created without remaining visible to that customer.
- **Root cause:** Production customer IDs use text identifiers such as `customer-...`, but the order payload coerced `customer_id` through UUID-only normalization and stored `null`.
- **Resolution:** Preserve text customer IDs in the Supabase order payload and verify both persistence and customer-visible filtering. Submission/profile errors were also made explicit.
- **Commit:** `a5e9cd4` — `fix(orders): preserve customer submission linkage`

## Confirmation route left the Customer Portal

- **Description:** Successful customer submission targeted a public confirmation route, removing the portal shell and making the workflow appear disconnected.
- **Root cause:** The confirmation page was routed at `/order-submitted` instead of as a child of the authenticated portal.
- **Resolution:** Added `/portal/order-submitted` under `CustomerPortalShell`, routed submissions there, and added a route regression test.
- **Commit:** `c2c6f0a` — `fix(orders): keep confirmation in customer portal`

## Successful submission was overwritten by a storefront redirect

- **Description:** Supabase returned `201` and confirmation navigation was requested, but the browser displayed the public storefront instead of the confirmation page.
- **Root cause:** After persistence, `setPendingRequest(null)` activated the request page's empty-request effect, which issued a competing `navigate("/")` and replaced `CustomerPortalShell` with the public layout.
- **Resolution:** Clear the persisted draft without nulling the redirect-driving state before confirmation navigation. Added cross-browser regression coverage.
- **Commit:** `9bbca14` — `fix(portal): preserve order confirmation navigation`

# Outstanding Critical Issues

## CRIT-001 — Development acceptance generated a fake Square checkout URL

**Priority: High**

- **Observed failure:** The customer followed `https://square.link/u/1d4595d7-617f-424a-bc77-b755c5606022` and Square returned HTTP 404.
- **Verified record:** Payment request `PR-MRQIIE8T68PZ`, order `TC-009779`, stored `provider_payment_link_id=local-1d4595d7-617f-424a-bc77-b755c5606022` and `provider_order_id=local-order-1d4595d7-617f-424a-bc77-b755c5606022`.
- **Root cause:** The Vite development client called a relative Netlify-function endpoint that returned 404. Development fallback then manufactured a placeholder `square.link` URL and persisted it as `sent`. Square never issued that URL.
- **Current status:** An isolated correction exists in the working tree with automated coverage: implicit development fallback is disabled, `local-*` links are rejected as payable, Vite proxies the function call to the deployed site, and invalid sent requests can regenerate a provider link. Manual regeneration and a successful live checkout are still required before this issue is accepted or committed.
- **Release requirement:** Verify a real persisted Square URL, non-local payment-link and order IDs, successful checkout, webhook processing, and deposit-state update.

No other confirmed release-blocking defect is currently open. Untested downstream stages remain acceptance risks rather than verified defects.

# Workflow / UX Improvements

These findings are important but deferred until the full business workflow is proven. They must not drive navigation or screen redesign during Critical-only acceptance work.

## Customer Experience

### UX-001 — Clarify the two-stage order handoff

**Priority: High**

Distinguish the public preview handoff from final authenticated submission. Both actions currently use “Submit Order Request.” Clarify that `/order-preview` saves and transfers a draft rather than creating an order. Replace final-sounding preview language such as “Order Preview,” “Order Summary,” “Order Total,” and “Final decorated catalog pricing” where it misstates the stage. Restored-draft messaging should make clear that final submission is still required.

### UX-002 — Streamline authenticated customer routing

**Priority: Medium**

Reconsider whether already-authenticated customers need every handoff screen, while preserving required review and data collection.

### UX-003 — Improve payment visibility and order association

**Priority: High**

Make Payment Due and the customer's next payment action more prominent. Payment requests should identify the related customer order more clearly. Customer-facing areas should emphasize the associated order number instead of internal payment-request IDs wherever practical.

### UX-004 — Improve order-list discovery and change awareness

**Priority: Medium**

Use more compact or collapsible order cards so lists remain scannable, help customers discover the strong expanded order-detail view, and show what changed since the customer's previous portal visit.

### UX-005 — Support multi-size ordering

**Priority: Medium**

Support ordering multiple sizes without relying on a single selected size.

### UX-006 — Support multi-product ordering

**Priority: Medium**

Support multiple products within one order request.

## Admin Experience

### ADM-001 — Make completed actions state-aware

**Priority: High**

Replace completed action buttons with status indicators, or disable/remove actions that no longer apply.

### ADM-002 — Strengthen next-action and workflow guidance

**Priority: High**

Provide one clear next-action recommendation based on current workflow gates. Present request approval, artwork, deposit, and production as a cleaner progression while preserving their independent gates. Prevent or clearly warn against illogical ordering; the current intake screen exposes all primary actions simultaneously.

### ADM-003 — Improve workflow success confirmations

**Priority: Medium**

Improve confirmations so Teresa can tell what changed and what the customer can now do.

### ADM-004 — Abstract payment implementation details

**Priority: Medium**

Teresa should see business states such as “Checkout link ready” or “Payment request sent,” not provider plumbing. Clarify that payment-request status `sent` means a checkout link was published to the portal; actual outbound email and SMS are not connected.

### ADM-005 — Improve customer identification

**Priority: Medium**

Some Admin screens rely heavily on email addresses to identify customers. Present more recognizable customer information—such as name, company, and relevant order context—where practical while preserving the existing data model.

# Future Enhancements

## FUT-001 — Connect outbound notification delivery

**Priority: Medium**

Connect real email and SMS delivery. Notification templates and activity previews exist, but delivery is not implemented.

## FUT-002 — Expand customer portal notifications

**Priority: Medium**

Add customer-facing portal notifications beyond payment requests and the workflow timeline, including richer “since your last visit” summaries and notification preferences.

## FUT-003 — Redesign the customer handoff after acceptance

**Priority: Medium**

Revisit the two-stage customer handoff only after end-to-end customer and Admin acceptance is complete. This future project should address `UX-001` and `UX-002` without weakening the validated business workflow.

## FUT-004 — Expand order composition

**Priority: Medium**

Implement the multi-size and multi-product capabilities recorded as `UX-005` and `UX-006`, including appropriate pricing and production breakdowns.

## FUT-005 — Broader responsive and visual polish

**Priority: Low**

Continue broader responsive and visual workflow polish only after Critical acceptance work is complete.

# Acceptance Testing Progress

## Completed

- [x] Customer authentication and authenticated portal entry.
- [x] Storefront garment selection and public order preview.
- [x] Pending-draft handoff into the authenticated request form.
- [x] Customer order submission.
- [x] Confirmation page and generated order number.
- [x] Customer order detail and My Orders visibility.
- [x] Customer order tracking and continued portal access.
- [x] Admin dashboard and submitted-request visibility.
- [x] Admin request review and approval actions.
- [x] Artwork-request action and resulting workflow state.
- [x] Deposit-request creation and customer payment-portal visibility.
- [x] Square payment-link generation mechanics and provider metadata in the established production path.

## In Progress

- [ ] **PAY-001 · High** — Regenerate the current acceptance payment request with a real Square provider link.
- [ ] **PAY-002 · High** — Verify the stored checkout URL, payment-link ID, and provider order ID are non-local and provider-issued.
- [ ] **PAY-003 · High** — Verify customer Pay Now opens a valid live Square checkout.
- [ ] **PAY-004 · High** — Complete a live Square payment for the current acceptance order.

## Not Yet Tested

- [ ] **PAY-005 · High** — Square webhook receipt for the new live payment.
- [ ] **PAY-006 · High** — Payment reconciliation and duplicate-event handling for the acceptance payment.
- [ ] **PAY-007 · High** — Deposit Received state in both Admin and Customer Portal.
- [ ] **PROD-001 · High** — Production-readiness gates after staff, artwork, and deposit approval.
- [ ] **PROD-002 · High** — Release to Production.
- [ ] **PROD-003 · High** — Printing/embroidery and QC/finishing progression.
- [ ] **PROD-004 · High** — Ready for Pickup customer and Admin behavior.
- [ ] **PROD-005 · High** — Order completion and final financial/timeline state.

# Recommended Next Steps

## 1. Critical fixes and acceptance blockers

1. Manually regenerate payment request `PR-MRQIIE8T68PZ` through the corrected Admin payment-request action.
2. Inspect the persisted record before exposing it to the customer. Confirm a real Square URL and non-local provider IDs.
3. Have the customer open Pay Now and confirm that Square Checkout loads successfully.
4. Complete a controlled live payment and verify the Square webhook, payment record, reconciliation state, order rollup, and Deposit Received transition.
5. Commit the isolated Square correction only after manual payment-link verification succeeds. Keep any additional blocker in its own tested commit.

## 2. Complete the business workflow

1. Confirm production-readiness gates after the deposit is received and artwork/staff approval are satisfied.
2. Release the accepted order to production.
3. Validate each production stage, timeline entry, and customer-visible status.
4. Validate Ready for Pickup and its customer communication state.
5. Complete the order and verify final financial, operational, customer, and audit history.

## 3. Workflow improvements

After end-to-end acceptance passes, prioritize clearer customer handoff wording, actionable customer payment visibility, state-aware Admin actions, and next-action guidance. Validate each improvement against the proven business workflow rather than redesigning the workflow during acceptance.

## 4. Future enhancements

Plan multi-size and multi-product ordering, outbound notification delivery, richer portal updates, and broader UX redesign as separate projects with their own acceptance criteria.

# Release Readiness

| Category | Status | Current assessment |
| --- | --- | --- |
| Critical Issues | **In Progress** | `CRIT-001` has an isolated correction and automated coverage, but real-link regeneration and manual acceptance are still pending. |
| Customer Workflow | **Complete** | Authentication, ordering, confirmation, order detail, My Orders visibility, tracking, and portal re-entry have been validated. Deferred UX findings do not block the proven workflow. |
| Admin Workflow | **Nearly Complete** | Dashboard, intake visibility, approval, artwork requests, and deposit requests have been validated. Downstream production and completion stages remain open. |
| Payments | **In Progress** | Portal payment-request visibility works, but the current request still requires a real provider link, successful live payment, webhook verification, and Deposit Received validation. |
| Production Workflow | **Not Yet Validated** | Production readiness, release, execution stages, pickup, and completion have not yet been tested end to end. |
| Overall Readiness | **In Progress** | Core customer and intake workflows are strong, but release is blocked by payment acceptance and unvalidated production-to-completion stages. |
