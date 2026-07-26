# Notification Engine Production Verification Plan

## Purpose and scope

This plan governs real-world verification and controlled cutover of the approved Notification Engine Phase 2 implementation. It does not authorize new notification events, providers, templates, or business behavior.

The supported notification event catalogue is:

1. `new_customer_request`
2. `quote_ready_for_approval`
3. `quote_approved`
4. `artwork_revision_requested`
5. `artwork_approved`
6. `deposit_requested`
7. `payment_request_created`
8. `payment_received`
9. `payment_failed`
10. `order_in_production`
11. `order_ready_for_pickup`
12. `order_completed`

Only `quote_approved` is approved for authoritative external email cutover under
this plan. All other events may be evaluated in Verify mode but must fall back
to Legacy behavior if Authoritative mode is selected. Authoritative SMS is
governed separately by the
[Notification Engine SMS Authoritative Cutover](../operations/notification-engine-sms-authoritative-cutover.md)
and remains disabled until that procedure's entry gates pass.

## Verification principles

- Use real business workflows. Do not manufacture database rows as a substitute for triggering the business event.
- Use controlled test orders and recipients approved by the Owner.
- Capture database identities, timestamps, and screenshots for every result. Capture provider evidence only when Legacy behavior or an authorized authoritative Delivery actually invokes a provider.
- Compare Legacy and Notification Engine results from the same business occurrence.
- Treat missing, duplicate, or unexplained records as a failed verification.
- Do not enable Authoritative mode until every required Verify-mode gate passes.
- Preserve `notification_activity` as read-only historical evidence.
- Never delete failed or duplicate records while investigating them.
- Record all times in UTC and include the application release identifier.

## Evidence record

Create one evidence record for every tested occurrence:

| Field | Value |
|---|---|
| Verification date/time | |
| Application release/commit | |
| Tester | |
| Environment | Production |
| Cutover mode | Legacy / Verify / Authoritative |
| Event type | |
| Subject type and ID | |
| Occurrence ID | |
| Verification expectation ID | Required in Verify / Authoritative |
| Workflow evidence source and record ID | Required in Verify / Authoritative |
| Legacy activity ID | |
| Business Event ID | |
| Notification ID | |
| Policy ID/version | |
| Template version ID(s) | |
| Delivery ID(s) | |
| Delivery Attempt ID(s) | N/A for observation-only Verify Deliveries |
| Provider message ID(s) | N/A for observation-only Verify Deliveries |
| Provider execution applicability | N/A / Legacy baseline / Authoritative required |
| Final result | Pass / Fail / Blocked |
| Evidence links | |
| Notes or discrepancy | |

## 1. Pre-cutover checklist

### Release and ownership

- [ ] The Phase 2A–2I commits intended for release are identified and reviewed.
- [ ] The production release artifact matches the reviewed commit.
- [ ] The Owner, deployment operator, database operator, and verification lead are identified.
- [ ] A verification window with low operational risk is scheduled.
- [ ] A stop authority is named and can immediately initiate rollback.
- [ ] Current production notification behavior is documented as the comparison baseline.
- [ ] Controlled test customers, email addresses, orders, quotes, artwork, and payments are prepared.
- [ ] Test recipients have agreed to receive production verification messages.
- [ ] Customer data used for testing is valid and does not expose unrelated customer information.

### Configuration

- [ ] `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE` is currently `legacy`.
- [ ] `VITE_NOTIFICATION_ENGINE_PHASE2B_SHADOW` is currently `false`, unless explicitly beginning Verify mode.
- [ ] `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER` is currently `false`.
- [ ] Resend credentials are present and unchanged from the working Legacy configuration.
- [ ] The configured sender identity matches the existing Order Approved sender.
- [ ] Supabase URL, publishable key, and service-role key are present in their correct runtime boundaries.
- [ ] No Twilio credentials or SMS activation are introduced.
- [ ] No additional email event is enabled for authoritative delivery.

### Business policy and content

- [ ] Every supported event has one current Notification Policy.
- [ ] Each policy has the intended enabled state and delivery mode.
- [ ] Customer, staff, and owner audience settings have Owner approval.
- [ ] Enabled channels have an assigned published template version.
- [ ] Disabled channels are documented as expected to create no Delivery.
- [ ] Current template subjects and bodies match approved production content.
- [ ] Required merge fields are available from the real workflow.
- [ ] Optional merge-field behavior is understood.
- [ ] Recipient source data is complete for the planned tests.

### Operational readiness

- [ ] Notification Activity is accessible to the Owner.
- [ ] Database queries can read Business Events, Notifications, Deliveries, Attempts, status history, and the cutover verification view.
- [ ] Provider logs can be searched by provider message ID and idempotency key.
- [ ] Application and Netlify function logs are available for the verification window.
- [ ] Alerts or manual checks exist for failed, retry-scheduled, and stuck-processing Deliveries.
- [ ] The rollback deployment and configuration procedure has been rehearsed.
- [ ] A backup or recovery point exists before database migrations are applied.

## 2. Database migration checklist

Apply migrations in phase order. Do not skip directly to Phase 2I.

- [ ] Confirm the production migration ledger and current schema version.
- [ ] Confirm a recoverable backup or snapshot was completed.
- [ ] Apply the Phase 2A foundation migration.
- [ ] Apply Phase 2E dispatcher and Staff adapter migrations.
- [ ] Apply the Phase 2F Resend adapter migration.
- [ ] Apply the Phase 2G delivery lifecycle migration.
- [ ] Apply the Phase 2H Owner administration migration.
- [ ] Apply `notification-engine-phase2i-cutover.sql`.
- [ ] Apply the approved production-readiness authorization, template-version, and verification-evidence migrations through `notification-engine-c6-verification-evidence.sql`.
- [ ] Record the start time, finish time, operator, and output for every migration.
- [ ] Confirm no migration reported an ignored or partial failure.
- [ ] Confirm existing `notification_templates`, `notification_activity`, and `staff_notifications` rows remain intact.
- [ ] Confirm all Notification Engine tables exist.
- [ ] Confirm all foreign keys, unique constraints, and status checks exist.
- [ ] Confirm current policies were seeded once and have only one effective row per event.
- [ ] Confirm published template versions exist for every assigned channel.
- [ ] Confirm dispatcher claim/completion functions are executable only by the intended service role.
- [ ] Confirm `notification_engine_activity` is readable by the Owner administration path.
- [ ] Confirm `notification_engine_cutover_verification` exists and returns expected columns.
- [ ] Confirm `notification_verification_expectations` and `notification_engine_parity_verification` exist.
- [ ] Confirm the verification view initially contains no unexplained failures.
- [ ] Confirm database timestamps use UTC.
- [ ] Run a read-only schema comparison against the approved migration definitions.
- [ ] Keep migrations additive; do not drop legacy history tables.

## 3. Verify-mode deployment checklist

### Deployment

- [ ] Deploy the reviewed application release with `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=verify`.
- [ ] Keep `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=false`.
- [ ] Confirm the deployed client reports Verify mode.
- [ ] Confirm Legacy processing remains authoritative.
- [ ] Confirm the Notification Engine creates observation-only durable records.
- [ ] Confirm observation Deliveries cannot be claimed by the authoritative cutover function.
- [ ] Confirm no new provider call originates from an observation-only Delivery.
- [ ] Confirm the existing Order Approved Legacy email still sends once.
- [ ] Confirm no additional email events send.
- [ ] Confirm SMS does not send.
- [ ] Confirm a durable verification expectation is registered for each controlled occurrence before evaluating parity.
- [ ] Stop if the expectation cannot be registered from an independent workflow evidence source.
- [ ] Stop if durable Business Events, Notifications, Deliveries, or parity-view results cannot be queried.

### Initial smoke test

- [ ] Trigger one controlled `quote_approved` occurrence.
- [ ] Confirm the existing Legacy email arrives once.
- [ ] Confirm one durable Business Event exists.
- [ ] Confirm one Notification exists for the policy evaluation.
- [ ] Confirm the policy snapshot matches the active Owner policy.
- [ ] Confirm resolved template content matches the Legacy subject and body.
- [ ] Confirm the resolved customer email matches the Legacy recipient.
- [ ] Confirm observation Delivery identities are unique.
- [ ] Confirm no observation Delivery produced a provider call.
- [ ] Confirm Notification Activity displays both durable operational information and preserved Legacy history.
- [ ] Stop verification if any duplicate customer email is observed.

## 4. Production parity verification checklist

Complete Gates A and B for every event in Verify Mode. Complete Gate C only for a provider execution explicitly authorized for real dispatch.

### Gate A — Workflow and Business Event acceptance

- [ ] The real business transition succeeded.
- [ ] A durable verification expectation references the independent workflow evidence source and source record.
- [ ] The expected event type, subject type, subject ID, occurrence ID, and timestamp match that workflow evidence.
- [ ] Exactly one Business Event exists for the event type, subject, and occurrence ID.
- [ ] Replaying or reopening the same occurrence does not create another Business Event.
- [ ] Exactly one Notification exists for the Business Event and policy version.
- [ ] The Notification references the correct Business Event.
- [ ] Stop and mark **Blocked** if the durable expectation is missing.
- [ ] Stop and mark **Blocked** if durable engine activity or the parity view is unavailable.

### Gate B — Policy, template, recipient, and Delivery parity

- [ ] The Notification policy snapshot matches the policy effective at occurrence time.
- [ ] Enabled, automatic, audience, and channel settings match Owner configuration.
- [ ] Automatic-disabled or policy-disabled outcomes create no dispatchable Delivery.
- [ ] Expected channel/recipient/destination branches are registered in durable verification evidence.
- [ ] Every expected enabled channel-and-recipient branch creates exactly one Delivery.
- [ ] Every disabled channel creates zero Deliveries.
- [ ] No expected branch is missing.
- [ ] No unexpected branch exists.
- [ ] No recipient/channel branch is duplicated.
- [ ] Multiple recipients, if configured, receive distinct Delivery identities.
- [ ] Missing destinations produce `not_deliverable`, not a provider call.
- [ ] Suppressed recipients produce `suppressed`, not a provider call.
- [ ] The assigned published template version is selected for each enabled channel.
- [ ] The template version is immutable and correctly referenced.
- [ ] Rendered subject and body snapshots are stored before dispatch.
- [ ] Required merge fields contain authoritative business values.
- [ ] Optional missing fields behave as approved.
- [ ] No required token remains unresolved.
- [ ] Rendering failure is recorded before dispatch and creates no provider invocation.
- [ ] Recipient and destination snapshots are correct.
- [ ] Delivery idempotency keys are stable and unique.
- [ ] Observation-only Deliveries remain non-dispatchable and create no Delivery Attempt.
- [ ] Observation-only Delivery state reflects preparation outcome: `queued`, `not_deliverable`, or `suppressed`.
- [ ] Notification aggregate state matches all Delivery outcomes.
- [ ] Notification Activity shows the same identities and states as the database.
- [ ] Existing Legacy activity remains visible and unchanged.

### Gate B parity-view pass standard

- [ ] `exactly_one_business_event` is true.
- [ ] `exactly_one_notification` is true.
- [ ] `delivery_branches_match` is true.
- [ ] `missing_delivery_count` is zero.
- [ ] `unexpected_delivery_count` is zero.
- [ ] `duplicate_delivery_count` is zero.
- [ ] `disabled_channels_empty` is true.
- [ ] `aggregate_matches` is true.
- [ ] `parity_passed` is true.
- [ ] Any false value is investigated and resolved before cutover.

### Gate C — Authoritative provider execution

Gate C is **Not Applicable** to every observation-only Verify Delivery. Do not invoke a provider to complete Verify Mode.

For an event/channel authorized for real dispatch:

- [ ] Exactly one eligible Delivery is claimed.
- [ ] Exactly one immutable Delivery Attempt represents each provider invocation.
- [ ] The provider receives the stored destination and rendered content.
- [ ] The provider idempotency key matches the Delivery identity.
- [ ] Provider success, terminal failure, retryable failure, or indeterminate outcome is normalized.
- [ ] Provider message ID is recorded when supplied.
- [ ] Delivery Attempt and Delivery timestamps and failure details are recorded.
- [ ] Retry execution is verified only when an authorized real provider invocation returns a retryable or indeterminate outcome.
- [ ] Final Delivery state matches provider evidence.
- [ ] Notification aggregate state matches all authoritative Delivery outcomes.
- [ ] Partial channel success does not overwrite successful Deliveries.

### Mode-specific pass standards

| Mode | Required to pass | Provider fields |
|---|---|---|
| Legacy baseline | Real workflow and existing Legacy behavior are recorded. Engine gates are not evaluated unless Verify is also enabled. | Required only for provider calls already made by Legacy behavior. |
| Verify | Gate A and Gate B pass from durable expectations and observation records. No observation Delivery invokes an adapter. | Delivery Attempt, provider invocation, provider message ID, retry execution, and final provider outcome are **Not Applicable**. |
| Authoritative | Gate A and Gate B pass, the event/channel is explicitly authorized, and Gate C passes. | Required for every real authoritative provider invocation. |

During Verify Mode, the existing Legacy-authoritative Order Approved email remains part of the Legacy comparison baseline. Its Resend evidence is required for Legacy parity, but it must not be attributed to the observation-only engine Delivery and does not make an engine Delivery Attempt applicable.

### Evidence required before Authoritative cutover

- [ ] Durable workflow expectation and source evidence exist for every tested occurrence.
- [ ] Every supported event has representative Gate A and Gate B evidence or an explicitly approved **Blocked** record.
- [ ] All applicable parity-view rows have `parity_passed = true`.
- [ ] Observation Deliveries produced no Attempts or provider invocations.
- [ ] Existing Legacy Order Approved evidence proves approval timing, recipient, sender, subject, body, exactly one Resend invocation, and the Legacy provider result.
- [ ] The controlled Order Approved candidate has correct policy, template, rendering, recipient, and Delivery evidence.
- [ ] Owner and stop authority explicitly authorize Gate C for Order Approved email.

Authoritative verification passes only after the authorized canary also records one Delivery Attempt per provider invocation, provider identity and message ID when supplied, retry/failure classification, final Delivery outcome, matching aggregate state, and no duplicate send.

## 5. Rollback procedure

Use rollback for duplicate sends, missing required notifications, incorrect recipients or content, unresolved identity mismatches, provider anomalies, stuck claims, or aggregate-state discrepancies.

### Immediate rollback

1. Announce the rollback and pause controlled Order Approved workflow actions.
2. Set `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=false` and deploy the server configuration first. This is the emergency stop for new provider execution.
3. Set `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=legacy` and deploy the client configuration.
4. Confirm the server gate is false and the deployed client is in Legacy mode before resuming workflow actions.
5. Treat any event accepted by an Authoritative client during the transition as an incident: preserve its queued Delivery, reconcile it, and do not replay it blindly.
6. Confirm the Legacy Order Approved path sends exactly once using a new controlled order.
7. Confirm no authoritative Delivery can be claimed after the server gate is disabled.

### Protect and assess data

- [ ] Do not delete Business Events, Notifications, Deliveries, Attempts, or status history.
- [ ] Do not alter Legacy activity history.
- [ ] Record the exact cutover time and rollback time.
- [ ] Identify all events accepted during the affected window.
- [ ] Identify Deliveries in `queued`, `processing`, or `retry_scheduled`.
- [ ] Identify expired claims and provider calls with indeterminate outcomes.
- [ ] Reconcile provider logs before manually sending anything.
- [ ] Do not replay an event until provider idempotency and Delivery state are understood.
- [ ] Record customer-impact and operational follow-up.
- [ ] Return to Verify mode only after the cause is corrected and regression-tested.

### Database rollback boundary

Phase 2 migrations are additive. Application rollback should normally use configuration and release rollback, not destructive schema rollback. Leave durable records and verification views available for investigation. A database restore is reserved for a separately approved database incident procedure.

## 6. Cutover procedure

Cut over only `quote_approved`.

### Entry gates

- [ ] All pre-cutover and migration checks pass.
- [ ] Verify mode has run through an agreed representative volume and duration.
- [ ] Every supported event has completed its acceptance checklist or has an explicitly approved, evidence-backed block.
- [ ] Order Approved parity is confirmed for transition timing, recipient, sender, subject, body, idempotency, provider ID, failure visibility, and no duplicate sends.
- [ ] The cutover verification view contains no unresolved false gates.
- [ ] Retry behavior has been tested without sending duplicates.
- [ ] Owner and stop authority approve cutover.

### Controlled activation

For an approved SMS cutover, complete the separate
[SMS Authoritative Cutover procedure](../operations/notification-engine-sms-authoritative-cutover.md).
Its SMS server gate must be validated while this client remains in Verify mode
before proceeding with the global Authoritative client switch.

1. Pause controlled Order Approved workflow actions for the configuration transition.
2. Keep the deployed client in Verify mode.
3. Set `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=true` and deploy or refresh the server runtime configuration.
4. Confirm the server capability is healthy but that observation-only Verify Deliveries remain ineligible for authoritative claiming.
5. Confirm there are no unexplained pre-existing authoritative queued or retry-scheduled Deliveries.
6. Deploy `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=authoritative`.
7. Confirm the effective client mode is Authoritative and non-`quote_approved` events still fall back to Legacy.
8. Resume only the single controlled Order Approved workflow action.
9. Confirm one Business Event, one Notification, and exactly the policy-enabled Deliveries and Attempts.
10. Confirm exactly one customer email arrives.
11. Confirm sender, recipient, subject, and body match the approved Legacy behavior.
12. Confirm the Resend provider message ID is stored.
13. Confirm each Delivery and the Notification aggregate match the actual outcomes.
14. Observe the system for the agreed soak period before testing another Order Approved event.

The order is mandatory. Enabling Authoritative client mode while the server gate
is false is not a valid intermediate state: the client suppresses Legacy
processing, but the trusted server refuses authoritative execution.

### Stop conditions

Immediately roll back if:

- More than one provider call or customer email occurs.
- No email is sent for an eligible approved order.
- Recipient, sender, subject, or body differs from the approved result.
- A provider call occurs without a Delivery Attempt.
- A disabled channel creates a Delivery.
- A required merge token is unresolved.
- Delivery and Notification states disagree with the actual outcome.
- A claim is abandoned without recovery visibility.

## 7. Post-cutover validation

- [ ] Verify the first controlled Order Approved event end to end.
- [ ] Verify the next naturally occurring Order Approved events during the soak period.
- [ ] Confirm each occurrence creates one durable identity chain.
- [ ] Confirm no new Legacy activity row is created for authoritative events.
- [ ] Confirm earlier Legacy history remains visible.
- [ ] Confirm duplicate UI actions, refreshes, and workflow reopens do not duplicate sends.
- [ ] Confirm non-Order Approved events remain Legacy.
- [ ] Confirm no SMS or Twilio invocation occurs.
- [ ] Confirm Staff Inbox read/unread behavior, filters, links, and counts remain unchanged.
- [ ] Confirm provider message IDs can be reconciled to Resend logs.
- [ ] Confirm no unexplained `queued`, `processing`, or `retry_scheduled` Deliveries accumulate.
- [ ] Confirm all verification-view gates remain true.
- [ ] Record Owner acceptance after the soak period.

## 8. Retry-system verification

This section is **Not Applicable in observation-only Verify Mode**. Execute it only for a channel authorized for real provider dispatch, using a controlled provider test condition. Never induce failure for an unrelated customer.

### Retryable failure

- [ ] Cause or simulate an approved retryable provider outcome.
- [ ] Confirm the original Delivery becomes `retry_scheduled`.
- [ ] Confirm attempt count increments once.
- [ ] Confirm the first Attempt is immutable and classified `retryable`.
- [ ] Confirm `next_retry_at` matches configured bounded exponential backoff.
- [ ] Confirm the same Delivery ID and provider idempotency identity are retained.
- [ ] Confirm the retry creates a new Attempt with the next attempt number.
- [ ] Confirm success changes the Delivery to `sent` and Notification to the correct aggregate state.

### Retry exhaustion

- [ ] Produce retryable failures through the configured maximum attempt count.
- [ ] Confirm each retry creates one new immutable Attempt.
- [ ] Confirm no attempt exceeds the configured limit.
- [ ] Confirm final Delivery state is `failed`.
- [ ] Confirm final failure code, reason, provider ID if any, and timestamps remain visible.

### Terminal failure

- [ ] Produce an approved terminal failure.
- [ ] Confirm the Delivery becomes `failed`.
- [ ] Confirm no retry is scheduled.
- [ ] Confirm the Attempt is classified `terminal`.

### Indeterminate or lost response

- [ ] Exercise an indeterminate provider result or lost-response condition.
- [ ] Confirm it is not treated as a definite unsent result.
- [ ] Confirm replay uses the same provider idempotency key.
- [ ] Reconcile provider logs before any manual resend.
- [ ] Confirm no duplicate customer email occurs.

### Claim recovery and concurrency

- [ ] Expire a controlled processing claim.
- [ ] Confirm abandoned-claim recovery makes it eligible again.
- [ ] Run concurrent workers against the same eligible Delivery.
- [ ] Confirm only one worker claims it.
- [ ] Confirm an already-sent Delivery is never retried.
- [ ] Confirm a successful channel remains successful while another channel retries or fails.

## 9. Provider verification

This section does not apply to observation-only engine Deliveries. In Verify Mode, mark these checks **Not Applicable — observation only**. Use the Resend checks for the existing Legacy Order Approved baseline and, after approval, for the authoritative Order Approved email canary. Do not invoke a provider solely to satisfy this checklist.

### Resend

- [ ] Provider adapter receives only the stored destination and rendered content.
- [ ] Sender identity matches the configured and approved sender.
- [ ] Recipient address matches the Delivery destination snapshot.
- [ ] Subject and body match the stored rendered snapshots exactly.
- [ ] Provider idempotency key matches the Delivery identity.
- [ ] Provider is invoked only for an eligible claimed Order Approved email Delivery.
- [ ] Provider response is normalized as sent, failed, or indeterminate.
- [ ] Provider message ID is stored on both relevant Attempt and Delivery records.
- [ ] Provider failure code and safe reason are recorded.
- [ ] Provider logs and application records agree on timestamps and outcome.
- [ ] No provider secrets or unnecessary payload data appear in activity history.

### Staff internal adapter

- [ ] One eligible Staff Delivery creates one Staff Inbox entry.
- [ ] Business Event, Notification, Delivery, Attempt, and Staff Inbox identities are linked.
- [ ] Replay does not duplicate the Staff Inbox entry.
- [ ] Read/unread state, filters, links, and unread counts remain unchanged.

### SMS

- [ ] Confirm SMS remains inactive.
- [ ] Confirm no Twilio request occurs.
- [ ] Confirm SMS-enabled policy evaluation in Verify mode does not imply an authoritative provider send.

## 10. Operational monitoring checklist

### During Verify mode

- [ ] Review verification-view failures daily during the verification window.
- [ ] Review duplicate Business Event or Notification conflicts.
- [ ] Review enabled-channel recipient cardinality differences.
- [ ] Review disabled-channel Delivery violations.
- [ ] Review resolution failures and unresolved required tokens.
- [ ] Compare Legacy and durable recipient/content outcomes.
- [ ] Confirm observation records never produce external provider calls.

### During and after cutover

- [ ] Monitor Business Events accepted per event type.
- [ ] Monitor Notifications by aggregate state.
- [ ] Monitor Deliveries by channel and status.
- [ ] Monitor processing claim age and expired claims.
- [ ] Monitor retry volume, retry age, and exhaustion.
- [ ] Monitor provider acceptance and failure rates.
- [ ] Monitor missing provider message IDs for sent Deliveries.
- [ ] Monitor indeterminate outcomes and lost responses.
- [ ] Monitor duplicate provider idempotency responses.
- [ ] Monitor not-deliverable and suppressed counts.
- [ ] Monitor legacy-versus-authoritative activity creation.
- [ ] Reconcile Resend counts against sent email Deliveries.
- [ ] Review Notification Activity for operational clarity.
- [ ] Maintain an incident record for every rollback or manual intervention.

## Business-event acceptance checklist

Use one fresh, controlled business occurrence per event. If durable workflow evidence or engine activity is unavailable, record the event as **Blocked**; do not fabricate evidence or invoke a provider to manufacture a pass.

### Acceptance checks required for every supported event in Verify Mode

#### Workflow and Business Event acceptance

- [ ] Real workflow occurrence completed.
- [ ] Durable expectation registered from an independent workflow evidence record.
- [ ] Expected event identity and timestamp match the workflow occurrence.
- [ ] Exactly one Business Event created.
- [ ] Exactly one Notification created.
- [ ] Activity history and durable identities are queryable.

#### Policy, template, recipient, and Delivery parity

- [ ] Correct policy and policy snapshot applied.
- [ ] Correct published template version selected.
- [ ] Merge fields rendered correctly with no unresolved required token.
- [ ] Correct recipient branches registered in verification evidence.
- [ ] Exactly one Delivery exists for every expected channel/recipient/destination branch.
- [ ] No missing, duplicate, disabled-channel, or unexpected Delivery exists.
- [ ] Delivery state and Notification aggregate state are correct for observation-only processing.
- [ ] All parity-view gates pass.

#### Provider-execution applicability

For every observation-only Verify Delivery, record:

- Delivery Attempt: **Not Applicable**
- Provider invocation: **Not Applicable**
- Provider message ID: **Not Applicable**
- Retry execution: **Not Applicable**
- Final provider outcome: **Not Applicable**

These fields become required only for an event/channel explicitly authorized for real dispatch.

### Event-by-event applicability

| Event | Verify Gates A and B | Verify engine provider fields | Existing Legacy provider baseline | Authoritative Gate C |
|---|---|---|---|---|
| New Customer Request — `new_customer_request` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Quote Ready For Approval — `quote_ready_for_approval` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Quote Approved / Order Approved — `quote_approved` | Required | N/A — observation only | Required: approval timing and exactly one existing Legacy Resend email | Required for the approved email canary after cutover |
| Artwork Revision Requested — `artwork_revision_requested` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Artwork Approved — `artwork_approved` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Deposit Requested — `deposit_requested` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Payment Request Created — `payment_request_created` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Payment Received — `payment_received` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Payment Failed — `payment_failed` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Order In Production — `order_in_production` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Order Ready For Pickup — `order_ready_for_pickup` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |
| Order Completed — `order_completed` | Required | N/A — observation only | Record existing Legacy result; no new call | N/A — not authorized |

### Per-event pass/fail rule

An event passes Verify Mode only when:

1. Its expectation was registered from durable independent workflow evidence.
2. Gate A passes.
3. Gate B passes, including `parity_passed = true`.
4. Every engine provider-execution field is recorded as **Not Applicable — observation only**.
5. No provider call originated from an observation Delivery.
6. Any existing Legacy behavior produced the approved baseline result.

An event is **Blocked**, not passed, if expectations were not registered, durable engine activity cannot be queried, or the real workflow occurrence cannot be demonstrated.

Order Approved passes Authoritative verification only when its prior Verify evidence passes and the authorized email Delivery additionally completes Gate C with exactly one Attempt, one provider invocation, reconciled provider identity/outcome, and no duplicate email.

## Recommended progression: Legacy → Verify → Authoritative

### Stage 1: Legacy baseline

1. Keep both cutover gates disabled.
2. Execute representative controlled business events.
3. Record current recipients, content, timing, provider results, activity, and Staff Inbox behavior.
4. Resolve baseline defects before evaluating parity.
5. Confirm rollback can restore this exact state.

### Stage 2: Verify

1. Deploy Verify mode while keeping the server authoritative gate false.
2. Execute every supported event through its real business workflow.
3. Register durable expectations from independent workflow evidence for every occurrence.
4. Complete Gates A and B for every event; mark all engine provider fields **Not Applicable — observation only**.
5. Compare durable records to the Legacy baseline, including the existing Legacy Order Approved Resend result.
6. Run the verification-view gates after each occurrence.
7. Confirm no observation Delivery produced a Delivery Attempt or provider call.
8. Continue for an agreed representative volume and duration.
9. If parity fails, return to Legacy mode, preserve evidence, correct the defect, and restart Verify evaluation for the affected event plus regression events.

### Stage 3: Authoritative canary

1. Obtain Owner approval based on recorded Verify evidence.
2. Pause controlled Order Approved workflow actions.
3. While the client remains in Verify mode, enable and verify the server gate.
4. Confirm observation-only Deliveries remain ineligible and no unexplained authoritative backlog exists.
5. Deploy Authoritative client mode.
6. Confirm all non-Order Approved events remain Legacy.
7. Process one controlled Order Approved event.
8. Validate the complete identity, content, provider, state, and activity chain.
9. Roll back immediately on any stop condition.

### Stage 4: Authoritative soak

1. Allow a small, controlled number of real Order Approved events.
2. Review each event individually.
3. Monitor retries, provider reconciliation, claim recovery, and aggregate state.
4. Keep the rollback operator available throughout the soak period.
5. Record final Owner acceptance only after the agreed duration and volume pass.

### Explicit rollback from any stage

1. Pause controlled workflow actions and disable `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER` first to stop provider execution.
2. Deploy the server configuration and confirm the gate is false.
3. Set `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=legacy`, deploy it, and confirm the effective client mode.
4. Stop event replay and manual resend activity.
5. Reconcile all in-flight, queued, and indeterminate Deliveries with provider logs.
6. Preserve all durable and Legacy audit records.
7. Document the discrepancy, affected identities, and customer impact.
8. Resume workflow actions only after both rollback settings are confirmed.
9. Resume engine evaluation only in Verify mode after corrective work and regression verification.

## Final production acceptance record

- [ ] Database migrations verified
- [ ] Legacy baseline accepted
- [ ] Verify-mode event checklist complete
- [ ] Verification-view gates pass
- [ ] Order Approved parity accepted
- [ ] Retry and claim recovery accepted
- [ ] Provider reconciliation accepted
- [ ] Operational monitoring active
- [ ] Rollback rehearsed
- [ ] Authoritative canary accepted
- [ ] Authoritative soak accepted
- [ ] Owner production acceptance recorded

Approval:

| Role | Name | Decision | Date/time | Notes |
|---|---|---|---|---|
| Owner | | Approve / Reject | | |
| Verification lead | | Approve / Reject | | |
| Deployment operator | | Approve / Reject | | |
| Database operator | | Approve / Reject | | |
