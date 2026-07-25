# ADR: Decouple Payment Reconciliation from Payment Exceptions

- **Status:** Proposed
- **Date:** 2026-07-24
- **Decision owners:** Product owner and engineering
- **Scope:** Payment ingestion, order financial projections, reconciliation, and owner exception review

## Context

Acceptance testing identified that the Payment Exceptions workspace is not currently a read-only exception-management surface. Loading `PaymentReconciliation` also performs deterministic repair of order financial projections.

This creates a hidden dependency on owner navigation: some order-level financial fields may remain stale until an owner opens the workspace. Payment correctness must not depend on Teresa knowing that a technical reconciliation page needs to be visited.

## Current Architecture

### Payment ingestion

Square payment events are processed by `processSquareWebhookEvent` in `src/services/squareWebhookProcessor.js`. Webhook processing:

1. Rejects unsupported or previously processed events.
2. Resolves the related payment request.
3. Determines whether the incoming event may advance payment state.
4. Updates the payment request when appropriate.
5. Creates or updates the payment record.
6. Records a payment event and any detected reconciliation issues.
7. Triggers payment-failure notifications when applicable.

Webhook ingestion does not call the order financial rollup synchronization used by the Payment Exceptions page.

### Payment requests

Payment requests represent a requested deposit, balance, full payment, or custom amount. They contain the requested and paid amounts, provider identifiers, request status, and the associated customer and order references.

### Payment records

Payment records represent successful, processing, failed, or otherwise terminal payment attempts. Provider events and payment records are persisted separately so the application can identify duplicates, out-of-order events, manual/Square conflicts, overpayments, and mismatched amounts.

### Order financial projections

Orders contain denormalized financial projection fields used by owner and production workflows, including:

- `total_paid`
- `amount_paid`
- `paid_to_date`
- `deposit_applied`
- `deposit_outstanding`
- `deposit_paid_amount`
- `balance_due`
- `payment_status`
- `payment_collection_state`
- `quote_status`
- `deposit_workflow_status`
- `deposit_status`

`buildOrderPaymentRollup` derives these projections from the order, its payment requests, and successful payment records. `buildOrderPaymentReconciliationUpdates` compares the derived projection with the stored order and returns only changed fields.

### Exception detection

`buildPaymentReconciliationInsights` and `buildPaymentExceptionQueue` derive exceptions from payment requests, payment records, provider events, and prior owner reviews. Examples include:

- Duplicate webhook delivery
- Duplicate Square payment records
- Manual and Square payment conflicts
- Overpayments
- Payment amount mismatches
- Webhook processing failures
- Stale or delayed provider events

Exception detection is deterministic and can run without owner input. The resulting exception may still require human judgment.

### Owner review

The Payment Exceptions workspace allows an owner to inspect a selected exception, open its payment request or order, review its event timeline and provider evidence, and record a review outcome such as:

- Mark reviewed
- Resolve duplicate
- Ignore false positive

These are legitimate owner decisions and belong in an exception workspace.

### Current page-load repair

The repair occurs in a `useEffect` inside `src/admin/PaymentReconciliation.jsx`.

When the page loads or its payment request/payment dependencies change, the effect:

1. Reads all stored orders using `getStoredOrders`.
2. Calls `buildOrderPaymentReconciliationUpdates` for every order.
3. Filters to orders whose stored financial fields differ from the derived rollup.
4. Calls `updateStoredOrder` for every stale order.
5. Refreshes the page state after the writes complete.

This is the only application call site currently applying `buildOrderPaymentReconciliationUpdates` to stored orders.

The session-level `usePaymentReconciliationRefresh` hook does not replace this behavior. It periodically refreshes payment and order data, and refreshes again on focus or visibility changes, but it does not calculate or persist corrected order projections.

## Problem

### UI navigation triggers business-data repair

A presentation component should not be responsible for repairing deterministic business state. Mounting or unmounting a page is not a reliable business event:

- The page may never be opened.
- A browser may close before writes complete.
- Multiple sessions may perform the same repair concurrently.
- Access, navigation, or future UI redesigns may unintentionally disable reconciliation.
- Owners cannot tell that opening the page has changed order records.

### Correctness depends on user behavior

Order financial projections drive payment status, balances, deposit satisfaction, quote progress, and production readiness. These projections must remain correct whether or not any owner visits Payment Exceptions.

### Owner intent is unclear

Opening an exception queue communicates an intent to inspect anomalies. It does not communicate authorization or intent to rewrite every stale order projection. Deterministic synchronization should be automatic and auditable; only ambiguous decisions should require Teresa.

### The workspace cannot safely become exception-only yet

De-emphasizing or conditionally hiding Payment Exceptions before moving the repair responsibility could leave stale projections unrepaired. The UI recommendation therefore depends on completing this architectural migration first.

## Decision

Separate payment reconciliation into four responsibilities:

1. **Ingestion:** persist provider and manual payment facts.
2. **Projection synchronization:** deterministically update the associated order financial projection.
3. **Exception detection:** automatically identify facts that cannot be reconciled safely.
4. **Owner review:** present only genuine exceptions requiring human judgment.

Deterministic projection synchronization will occur independently of UI navigation. The Payment Exceptions workspace will not perform corrective writes on load.

## Target Architecture

```text
Payment received
      |
      v
Persist payment request, payment, and event facts
      |
      v
Recalculate and persist the affected order financial projection
      |
      v
Detect reconciliation exceptions
      |
      +---- no ambiguity ----> Complete automatically and record audit evidence
      |
      +---- ambiguity -------> Create owner-facing Payment Exception
```

### Primary path: event-driven synchronization

Successful webhook processing should update payment facts and the affected order projection as one idempotent operation. Where supported, these writes should share a transaction or atomic adapter boundary.

Manual payment and other non-webhook entry paths must invoke the same projection synchronization service after persisting payment facts.

### Recovery path: background reconciliation

A server-side background job should periodically compare stored order projections with authoritative payment facts. It should:

- Repair safe deterministic differences.
- Avoid duplicate writes when projections already match.
- Record what changed, why, and which job or event initiated the repair.
- Retry transient failures.
- Emit genuine ambiguity into the exception system instead of guessing.

The job is a recovery mechanism for missed, delayed, or partially processed events. It is not the primary payment-processing path.

### Exception path: owner judgment

Payment Exceptions should contain only cases where automatic correction is unsafe or a business decision is required, such as:

- Multiple plausible payments for the same obligation
- Manual and provider payments that may duplicate one another
- Overpayments
- Amount or order mismatches
- Provider processing failures that cannot be retried safely
- Conflicting evidence requiring verification

Opening the workspace must be observational until the owner explicitly chooses a review action.

## Migration Plan

### Phase 1: Synchronize order rollups during webhook processing

1. Extract an application-level operation that accepts an order number and current payment facts, derives the rollup, and persists only changed projection fields.
2. Invoke that operation after a webhook has safely persisted the payment request, payment, and payment event.
3. Include projection synchronization in the existing atomic adapter boundary where possible.
4. Preserve webhook idempotency so duplicate deliveries cannot double-apply money or repeatedly advance order state.
5. Record structured audit information for projection updates and failures.
6. Add regression coverage proving a completed Square webhook updates the associated order without loading any UI.
7. Keep the page-load repair temporarily as a measured safety net until production evidence confirms the new path.

### Phase 2: Add automatic background reconciliation

1. Implement a server-side scheduled reconciliation job.
2. Select orders with recent payment activity, incomplete processing, or stale projection timestamps; avoid scanning all history unnecessarily.
3. Recompute projections from authoritative payment requests and payment records.
4. Apply only deterministic changes through the same synchronization operation introduced in Phase 1.
5. Create or refresh exceptions for ambiguous differences.
6. Add retry, idempotency, concurrency, and audit behavior.
7. Add monitoring for scanned records, repaired projections, exceptions created, failures, retries, and reconciliation lag.
8. Alert engineering when the job fails or reconciliation lag exceeds an agreed threshold.

### Phase 3: Cover every payment path

Inventory and verify every way payment facts can change, including:

- Successful Square webhooks
- Failed and later successful Square events
- Manual payments
- Deposit requests and payments
- Balance and full-payment requests
- Payment edits or reversals, if supported
- Administrative imports or backfills
- Retry and recovery processing

For each path:

1. Persist payment facts first.
2. Run the shared order projection synchronization.
3. Detect exceptions.
4. Confirm production and order workflow consumers see the updated projection without a page refresh or exception-page visit.
5. Add regression coverage for idempotency, out-of-order events, duplicates, overpayments, and manual/provider conflicts.

After all paths are covered, add an automated test proving that navigating to Payment Exceptions is not required for projection correctness.

### Phase 4: Make Payment Exceptions review-only

1. Remove the page-load `useEffect` that calculates and writes order rollup repairs.
2. Ensure loading the page performs read operations only.
3. Retain explicit owner review mutations and their audit history.
4. Rename owner-facing reconciliation language to Payment Exceptions where approved.
5. Present the workspace as an exception queue entered from detected financial attention.
6. Provide a reassuring zero-state and return path to Financial.
7. De-emphasize the destination when the exception count is zero.
8. Remove any temporary compatibility or monitoring fallback introduced during migration.

## Acceptance Criteria

The refactor is complete when all of the following are true.

### Projection correctness

- A successful Square webhook updates the related order financial projection without any UI navigation.
- Manual and other supported payment paths update the same projection through the shared synchronization operation.
- Deposit, balance, payment status, quote status, and workflow-facing financial fields remain consistent with authoritative payment facts.
- Duplicate and out-of-order events do not double-count payments or regress a completed state.

### Recovery

- The background reconciliation job repairs a deliberately stale but unambiguous order projection.
- The job is idempotent and produces no write when the projection is already correct.
- Failed repairs are retried and observable.
- Ambiguous discrepancies become exceptions rather than automatic destructive corrections.

### Workspace behavior

- Opening Payment Exceptions performs no deterministic corrective writes.
- Opening, refreshing, or leaving the page does not change order financial projections.
- The workspace displays only genuine issues requiring human judgment.
- Owner review actions remain explicit, permission-protected, and audited.
- With zero exceptions, Teresa can ignore the workspace without affecting payment or order correctness.

### Independence from user sessions

- Projection correctness does not depend on an owner or customer browser being open.
- Projection correctness does not depend on Teresa visiting Financial, Payment Requests, or Payment Exceptions.
- Automated tests demonstrate correct projections after ingestion and background recovery with no mounted UI components.

### Operational evidence

- Webhook projection updates and background repairs emit sufficient audit information to explain when and why an order changed.
- Monitoring distinguishes successful automatic synchronization, repaired stale projections, genuine owner exceptions, and processing failures.
- Production observation confirms no unresolved stale projections remain before the page-load repair is removed.

## Consequences

### Benefits

- Payment and order correctness become independent of UI behavior.
- Teresa sees only exceptions that require her judgment.
- Payment Exceptions can be safely de-emphasized when healthy.
- Projection updates become reusable across all payment paths.
- Failures and recovery become observable and testable.

### Costs and risks

- Webhook and manual-payment paths require a shared synchronization boundary.
- Atomic behavior may require server-side transaction or adapter changes.
- Background reconciliation requires scheduling, monitoring, and retry policy.
- The migration must avoid running old and new writers in ways that produce conflicting updates.

### Risk controls

- Use idempotent calculations and changed-field writes.
- Introduce the new paths before removing the page-load fallback.
- Compare automatic results with the existing repair calculation during rollout.
- Remove the UI writer only after all payment paths and recovery behavior pass acceptance criteria.

## Non-Goals

This ADR does not:

- Change payment amounts or financial calculation rules.
- Redesign payment processing or provider behavior.
- Change owner permissions.
- Define new payment workflows.
- Resolve the final Payment Exceptions visual design.
- Replace human judgment for genuinely ambiguous payment evidence.
