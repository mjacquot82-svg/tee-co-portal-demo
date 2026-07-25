# Tee & Co Version 1.0 Implementation Roadmap

This roadmap translates the findings in [Acceptance Testing Review](./acceptance-testing-review.md) into an ordered development plan. The acceptance review remains the source of evidence and status; this document defines implementation sequence and project grouping.

## Planning Principles

- Preserve the validated Admin Dashboard and expanded Customer Order Detail experiences.
- Complete and validate the existing business architecture before redesigning it.
- Keep Critical fixes isolated, regression-tested, manually accepted, and separately committed.
- Prefer low-risk changes that improve acceptance confidence and daily usability.
- Do not begin major order-composition or navigation redesign while Version 1.0 readiness remains open.

# Phase 1 – Production Readiness

Phase 1 contains release blockers, remaining end-to-end validation, and a small set of high-impact refinements that improve operational confidence without changing the architecture.

## ROAD-1.1 — Correct and accept real Square checkout-link creation

- **Related Acceptance IDs:** `CRIT-001`, `PAY-001`, `PAY-002`, `PAY-003`
- **Priority:** High
- **Estimated implementation complexity:** Small
- **Dependencies:** Deployed Square payment-link function and valid production Square configuration.

Finish the isolated Square correction, regenerate the affected payment request, and verify that persisted checkout URL, payment-link ID, and provider order ID were issued by Square. Confirm that placeholder `local-*` records cannot appear as payable customer links. Manually verify that Pay Now reaches a valid Square checkout before committing.

## ROAD-1.2 — Validate live payment, webhook, and deposit receipt

- **Related Acceptance IDs:** `PAY-004`, `PAY-005`, `PAY-006`, `PAY-007`
- **Priority:** High
- **Estimated implementation complexity:** Medium
- **Dependencies:** `ROAD-1.1`; configured Square webhook; controlled live payment.

Complete a live payment and verify webhook receipt, idempotent processing, reconciliation, order financial rollup, and Deposit Received status in both Admin and Customer Portal. Implement only verified Critical fixes discovered during this validation.

## ROAD-1.3 — Validate production through completion

- **Related Acceptance IDs:** `PROD-001`, `PROD-002`, `PROD-003`, `PROD-004`, `PROD-005`
- **Priority:** High
- **Estimated implementation complexity:** Medium
- **Dependencies:** `ROAD-1.2`; approved staff review and artwork gates.

Validate production readiness, release to production, execution stages, Ready for Pickup, and final completion. Confirm each Admin transition, customer-visible status, financial state, and timeline entry. Keep any blocker fixes isolated and covered by regression tests.

## ROAD-1.4 — Clarify the public-to-authenticated submission handoff

- **Related Acceptance IDs:** `UX-001`
- **Priority:** High
- **Estimated implementation complexity:** Small
- **Dependencies:** Existing two-stage customer workflow remains unchanged.

Use distinct action wording and concise explanatory copy so customers understand that the public preview transfers a draft and the authenticated form performs final submission. Avoid route or architecture changes in this phase.

## ROAD-1.5 — Make payment due and related order context unmistakable

- **Related Acceptance IDs:** `UX-003`
- **Priority:** High
- **Estimated implementation complexity:** Small
- **Dependencies:** `ROAD-1.1` establishes the accepted payment-link behavior.

Emphasize Payment Due and the customer's next payment action. Prefer the associated order number over internal payment-request IDs in customer-facing summaries and calls to action.

## ROAD-1.6 — Make completed Admin intake actions state-aware

- **Related Acceptance IDs:** `ADM-001`
- **Priority:** High
- **Estimated implementation complexity:** Medium
- **Dependencies:** Existing approval, artwork, and deposit states must remain authoritative.

Replace completed or no-longer-applicable actions with status indicators or disabled states. Preserve access to valid alternate branches while preventing Teresa from unintentionally repeating completed actions.

## ROAD-1.7 — Add gate-aware Admin next-action guidance

- **Related Acceptance IDs:** `ADM-002`
- **Priority:** High
- **Estimated implementation complexity:** Medium
- **Dependencies:** `ROAD-1.2` and `ROAD-1.3` must confirm the real payment and production state transitions.

Present one clear recommended next action derived from staff review, artwork, deposit, and production gates. Warn against illogical ordering without collapsing the independent business gates into one status.

# Phase 2 – Workflow Polish

Phase 2 improves clarity, discoverability, and feedback after the end-to-end workflow is proven. These projects should refine the current experience rather than replace it.

## ROAD-2.1 — Improve customer order-list discovery and change awareness

- **Related Acceptance IDs:** `UX-004`
- **Priority:** Medium
- **Estimated implementation complexity:** Medium
- **Dependencies:** Preserve the validated expanded Customer Order Detail experience.

Make order lists more scannable with compact or collapsible cards, strengthen the path into expanded details, and show meaningful changes since the customer's previous visit. Focus redesign effort on discovery rather than the detail page itself.

## ROAD-2.2 — Improve Admin workflow success feedback

- **Related Acceptance IDs:** `ADM-003`
- **Priority:** Medium
- **Estimated implementation complexity:** Small
- **Dependencies:** Accepted state transitions from Phase 1.

After each action, clearly state what changed, the resulting status, and what the customer or Teresa can do next. Reuse consistent confirmation patterns across approval, artwork, deposit, and production actions.

## ROAD-2.3 — Replace provider terminology with business language

- **Related Acceptance IDs:** `ADM-004`
- **Priority:** Medium
- **Estimated implementation complexity:** Small
- **Dependencies:** Accepted payment semantics from `ROAD-1.1` and `ROAD-1.2`.

Describe payment states with language such as “Checkout link ready,” “Available in customer portal,” and “Payment received.” Avoid exposing provider plumbing and distinguish portal publication from unimplemented email or SMS delivery.

## ROAD-2.4 — Apply targeted responsive and visual polish

- **Related Acceptance IDs:** `FUT-005`
- **Priority:** Low
- **Estimated implementation complexity:** Medium
- **Dependencies:** Phase 1 workflow surfaces are stable.

Polish the proven workflow screens without changing information architecture. Preserve the Admin Dashboard's operational overview and the Customer Order Detail's expanded communication model.

# Phase 3 – Operational Improvements

Phase 3 improves Teresa's daily efficiency and customer communication using the accepted workflow and existing data model.

## ROAD-3.1 — Improve recognizable customer identification in Admin

- **Related Acceptance IDs:** `ADM-005`
- **Priority:** Medium
- **Estimated implementation complexity:** Small
- **Dependencies:** Existing customer identity and matching rules remain unchanged.

Show customer name, company, and relevant order context where screens currently rely heavily on email. Preserve email as supporting data and do not alter the customer data model.

## ROAD-3.2 — Connect outbound notification delivery

- **Related Acceptance IDs:** `FUT-001`
- **Priority:** Medium
- **Estimated implementation complexity:** Large
- **Dependencies:** Accepted workflow-event semantics; configured email/SMS providers; delivery and failure auditing.

Connect the existing notification templates and activity records to real email and SMS delivery. Preserve portal workflow state as the source of truth and make delivery status observable to Teresa.

## ROAD-3.3 — Expand customer portal notifications and visit summaries

- **Related Acceptance IDs:** `FUT-002`
- **Priority:** Medium
- **Estimated implementation complexity:** Medium
- **Dependencies:** Stable workflow events; preferably `ROAD-3.2` for consistent notification semantics.

Add customer-facing notification visibility beyond payment requests and timelines, including concise changes-since-last-visit summaries and notification preferences.

## ROAD-3.4 — Evolve the Admin Dashboard into a workflow-transition workspace

- **Related Acceptance IDs:** `ADM-002`, `ADM-003`
- **Priority:** High
- **Estimated implementation complexity:** Large
- **Dependencies:** Complete Production, Ready for Pickup, and Order Completion acceptance testing through `ROAD-1.3`; accepted queue and ownership transitions across the full operational workflow.

Acceptance testing confirmed that Admin actions update order state and Dashboard counters correctly, but the Dashboard does not clearly explain what changed after Teresa completes an action such as approving a request or requesting a deposit. It does not make the destination queue, the next operational priority, or a transfer of responsibility to the customer sufficiently visible. As a result, the Dashboard currently functions more as a collection of counters than as a guided operational workspace.

Revisit the Dashboard only after Production, Ready for Pickup, and Order Completion acceptance testing is complete. Treat this as an intentional workflow redesign that preserves the Dashboard's validated operational overview while making transitions understandable. The future project should consider highlighting recently moved work, explaining meaningful count changes, making queue movement and ownership changes obvious, reinforcing completed-action outcomes, and strengthening “Next Action” guidance. Do not implement this incrementally before the remaining workflow states are fully validated.

# Phase 4 – Future Major Features

Phase 4 contains architectural or data-model work intentionally separated from Version 1.0 production readiness.

## ROAD-4.1 — Redesign the authenticated customer handoff

- **Related Acceptance IDs:** `UX-002`, `FUT-003`
- **Priority:** Medium
- **Estimated implementation complexity:** Large
- **Dependencies:** Complete end-to-end acceptance; metrics and feedback from the clarified Version 1.0 handoff in `ROAD-1.4`.

Reassess which preview and handoff screens authenticated customers need while preserving required review, data collection, and draft recovery. Treat this as a deliberate workflow project rather than incremental route changes.

## ROAD-4.2 — Add multi-size order composition

- **Related Acceptance IDs:** `UX-005`, `FUT-004`
- **Priority:** Medium
- **Estimated implementation complexity:** Large
- **Dependencies:** Size-breakdown data model, pricing behavior, customer summaries, and production breakdown acceptance criteria.

Allow one product to contain quantities across multiple sizes and carry that breakdown consistently through pricing, customer review, Admin intake, and production.

## ROAD-4.3 — Add multi-product order composition

- **Related Acceptance IDs:** `UX-006`, `FUT-004`
- **Priority:** Medium
- **Estimated implementation complexity:** Large
- **Dependencies:** Line-item architecture, multi-product pricing, artwork and placement association, financial rollups, and production acceptance criteria.

Allow a customer request to contain multiple products while preserving accurate configuration, artwork, pricing, payment, and production relationships.

# Recommended Implementation Order

The recommended sequence maximizes acceptance confidence and business value while limiting architectural risk:

1. **`ROAD-1.1` — Correct and accept Square checkout links.** Remove the current release blocker and make customer payment testing possible.
2. **`ROAD-1.2` — Validate live payment through Deposit Received.** Prove the highest-risk external integration before investing in polish.
3. **`ROAD-1.3` — Validate production through completion.** Finish the complete revenue and fulfillment lifecycle, fixing only verified blockers.
4. **`ROAD-1.6` and `ROAD-1.7` — Make Admin actions state-aware and gate-guided.** Apply lessons from the proven workflow to improve Teresa's daily confidence.
5. **`ROAD-1.4` and `ROAD-1.5` — Clarify submission and payment actions.** Deliver small, low-risk customer improvements that remove the most consequential confusion.
6. **`ROAD-2.2` and `ROAD-2.3` — Improve success feedback and business terminology.** Standardize operational communication after state behavior is stable.
7. **`ROAD-2.1` — Improve order-list discovery.** Help customers reach the already-strong expanded order detail without redesigning it.
8. **`ROAD-3.1` — Improve Admin customer identification.** Increase daily efficiency with a contained presentation change.
9. **`ROAD-3.4` — Evolve the Dashboard into a workflow-transition workspace.** Revisit the full operational experience only after Production, Ready for Pickup, and Order Completion have been accepted.
10. **`ROAD-2.4` — Apply targeted visual polish.** Polish stable screens after workflow changes settle.
11. **`ROAD-3.2` and `ROAD-3.3` — Add real delivery and richer notifications.** Build on accepted event semantics as a separate operational project.
12. **Phase 4 projects — Handoff redesign, multi-size, and multi-product ordering.** Begin only after Version 1.0 is operationally proven and released.

Each roadmap project should begin with explicit acceptance criteria and end with focused automated tests, manual workflow verification, an update to the Acceptance Testing Review, and an isolated commit.
