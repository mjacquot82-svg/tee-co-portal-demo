# Notification Engine Phase 2 Architecture

## 1. Purpose

Notification Engine Phase 2 completes Tee & Co's delivery architecture without replacing the existing notification foundation.

The engine makes notification behavior a centrally configured business policy. When a recognized business event occurs, the application evaluates that policy consistently. Individual orders do not decide whether notifications should be sent, and staff are not prompted during routine automatic delivery.

Phase 2 separates:

- Business events.
- Notification policy.
- Template content.
- Recipient selection.
- Delivery orchestration.
- Provider execution.
- Delivery history.

Resend, Twilio, and future providers remain outside the business-policy layer.

## 2. Architectural Principles

### 2.1 Business policy is centralized

Each business event has one active notification policy defining:

- Whether the event is notification-enabled.
- Whether delivery is automatic.
- Which channels are enabled.
- Which audiences receive each channel.
- Which template is used.

The policy applies consistently whenever that business event occurs.

### 2.2 Business events do not send messages

Order, artwork, payment, and production workflows emit business events. They do not:

- Select providers.
- Render provider payloads.
- Call email or SMS providers.
- Manage retries.
- Write delivery results.

### 2.3 Templates contain content, not delivery logic

Templates define channel-specific message content and supported merge fields. They do not determine when a business event occurred or invoke providers.

### 2.4 Providers contain transport logic only

A provider adapter accepts a resolved delivery request and returns a normalized result. It does not decide:

- Whether delivery is allowed.
- Which template applies.
- Who should receive it.
- Whether the business event warrants a notification.

### 2.5 Accepted work must survive interruption

Once the engine accepts a notification for automatic delivery, it must be durably recorded. Browser refreshes, navigation, process interruption, or transient provider failures must not lose it.

### 2.6 Every channel is independently traceable

One business event can produce multiple notification deliveries. Email, SMS, and staff delivery each have their own status, attempts, idempotency identity, and final result.

## 3. Logical Architecture

```text
Business workflow
      |
      v
Business Event
      |
      v
Notification Engine
      |
      +-- Validate event
      +-- Load Notification Policy
      +-- Resolve Template
      +-- Build merge context
      +-- Resolve Recipients
      +-- Create Notification and Delivery records
                    |
                    v
             Delivery Dispatcher
                    |
             +------+------+ 
             |      |      |
             v      v      v
           Email   SMS   Staff/In-app
             |      |      |
             v      v      v
          Provider Provider Internal adapter
          Adapter  Adapter
             |      |
             v      v
          Resend  Twilio
                    |
                    v
            Delivery Attempt Log
                    |
                    v
       Sent / Delivered / Failed / Retry
```

The Notification Engine owns business interpretation. The dispatcher owns execution. Adapters own provider communication.

## 4. Core Domain Concepts

### 4.1 Business Event

A Business Event is an immutable statement that something meaningful occurred.

Existing examples include:

- `new_customer_request`
- `quote_ready_for_approval`
- `quote_approved`
- `artwork_revision_requested`
- `artwork_approved`
- `deposit_requested`
- `payment_request_created`
- `payment_received`
- `payment_failed`
- `order_in_production`
- `order_ready_for_pickup`
- `order_completed`

#### Required event identity

Every event should have:

- Unique event ID.
- Event type.
- Subject type, such as order, payment request, or artwork.
- Subject ID.
- Business occurrence ID, when available.
- Occurred timestamp.
- Source workflow.
- Actor or source identity.
- Structured event payload.
- Correlation ID linking related operations.

#### Event responsibility

The business workflow is responsible for establishing that the event happened.

For example:

- The order workflow determines that an order became ready for pickup.
- The payment workflow determines that payment was received.
- The artwork workflow determines that revision was requested.

The Notification Engine must not infer these transitions by repeatedly inspecting current records. It processes an explicit event produced as part of the successful business transition.

#### Event timing

The event becomes eligible for notification only after the corresponding business state is durably accepted. A notification must not be sent for a transition that fails to persist.

#### Existing architecture retained

The existing event catalogue and workflow hooks remain the starting point. Phase 2 formalizes their event envelope and durable processing boundary rather than replacing their business meanings.

## 5. Notification Policy

### 5.1 Purpose

A Notification Policy describes what Tee & Co wants the application to do whenever a particular business event occurs.

Policy and template content remain separate:

- Policy answers whether, how, and to whom.
- Template answers what the message says.

### 5.2 Policy scope

V1 has one active business policy for each event type.

Conceptually, each policy contains:

- Business event type.
- Policy enabled.
- Automatic delivery enabled.
- Email enabled.
- SMS enabled.
- Staff notification enabled.
- Customer audience enabled.
- Staff audience enabled.
- Owner audience enabled.
- Template assignment by channel.
- Effective timestamps.
- Updated timestamp and actor.

The existing template enablement fields can seed the initial policies, but channel behavior ultimately belongs to policy rather than template content.

### 5.3 Example policy

For `deposit_requested`:

| Setting | Value |
|---|---|
| Policy enabled | Yes |
| Automatic delivery | Yes |
| Email | Yes |
| SMS | Yes |
| Staff notification | Yes |
| Customer audience | Yes |
| Staff/owner audience | According to configured routing |

Whenever a new Deposit Requested event is accepted, the engine evaluates this policy. It does not ask the employee processing that order to select channels.

### 5.4 Automatic delivery

For Phase 2 V1:

- `automatic = true`: eligible enabled channels are queued immediately.
- `automatic = false`: the event and notification decision may be recorded, but no external delivery is queued.

This creates a clean future path to manual approval without requiring manual approval in V1.

### 5.5 Future manual approval

The policy model reserves a delivery mode rather than embedding manual approval into provider logic.

Future policy modes may be:

- Automatic.
- Approval required.
- Disabled.

When manual approval is introduced, approval moves a prepared notification into the same dispatcher used by automatic delivery. It does not create a separate sending system.

### 5.6 Policy snapshot

Every generated notification retains a snapshot or reference to the policy version used.

Changing the Owner's policy later must not rewrite the explanation of why an earlier notification was or was not delivered.

## 6. Template Resolution

### 6.1 Resolution responsibility

The Notification Engine resolves templates after loading the policy and before creating delivery records.

Provider adapters never look up business templates.

### 6.2 Resolution key

Template resolution uses:

- Business event type.
- Channel.
- Active template assignment.
- Applicable template version.
- Future optional dimensions such as language or audience.

For V1, the existing event-to-template mapping remains valid:

```text
event type -> template type
```

Where the current event and template identifiers match, that convention is preserved.

### 6.3 Channel-specific content

A resolved template can contain:

- Email subject.
- Email body.
- SMS body.
- Future channel-specific content.
- Declared or validated merge fields.

Only content required by an enabled delivery channel needs to be resolved.

### 6.4 Merge rendering

The existing merge-field model remains the foundation.

Rendering proceeds as follows:

1. Build a canonical merge context from the event and authoritative business records.
2. Validate that required values are available.
3. Resolve the selected template version.
4. Render channel-specific content.
5. Validate the rendered output.
6. Store the rendered snapshot with the notification or delivery.

Providers receive rendered content. They do not receive unresolved business templates.

### 6.5 Missing merge fields

Missing required fields produce a pre-dispatch failure, not a provider call.

The engine records:

- Which field was unavailable.
- Which template and version required it.
- Which delivery was affected.
- When resolution failed.

Unknown or unresolved tokens must not be silently delivered to customers.

### 6.6 Template version behavior

The current mutable, one-row-per-template model is synchronized but not versioned. The final architecture distinguishes:

- Stable template identity.
- Immutable template versions.
- Currently published version.
- Draft or superseded versions in the future.

Each delivery preserves:

- Template identity.
- Template version.
- Rendered subject and body.
- Merge context or an appropriately limited snapshot.

Historical records therefore remain understandable after templates change.

## 7. Recipient Resolution

### 7.1 Recipient resolver responsibility

Recipient resolution is a business-domain service used by the Notification Engine.

It receives:

- Business event.
- Policy.
- Audience.
- Channel.

It returns zero or more normalized recipients.

Provider adapters do not query customer, order, staff, or owner records.

### 7.2 Customer recipient

Customer recipient resolution uses the authoritative customer associated with the event subject.

It may return:

- Customer ID.
- Display name.
- Email address.
- Phone number.
- Locale when introduced.
- Channel eligibility.
- Suppression or contact restrictions when introduced.

A contact value carried in an event may be retained as context, but recipient selection does not depend on UI state or whichever order representation happens to be open.

If an enabled channel has no valid destination, that delivery is recorded as not deliverable or failed during resolution. Other valid channels continue independently.

### 7.3 Staff recipient

The existing staff inbox remains the internal staff channel.

Staff resolution may use:

- Assigned staff member.
- Responsible team.
- Role.
- Workflow responsibility.
- Policy-configured staff audience.

A staff notification is an internal delivery, not automatically an email to a generic staff address.

If future policy requests staff email or staff SMS, those become explicit channel-and-audience combinations rather than an implicit effect of enabling Staff Notification.

### 7.4 Owner recipient

Owner notification is a distinct audience resolved from configured owner/admin identities or roles.

It does not rely on a hard-coded owner email or phone number.

Owner routing can support:

- All owners.
- Primary owner.
- On-duty owner.
- A future policy-defined group.

### 7.5 Multiple recipients

The resolver returns a collection even when V1 normally produces one customer.

A notification can therefore produce:

- One customer email.
- One customer SMS.
- Several staff inbox records.
- One or more owner deliveries.

Each recipient-and-channel combination becomes a separate delivery record. The data model does not assume that one notification equals one address.

### 7.6 Recipient snapshot

Delivery records preserve the destination used at dispatch time.

Later changes to a customer's email address or phone number do not alter historical delivery records. Sensitive contact information is exposed only where operationally required.

## 8. Notification Creation

### 8.1 Notification record

One Notification record represents the engine's response to one business event under one policy evaluation.

It contains:

- Notification ID.
- Business event ID and type.
- Subject type and ID.
- Correlation ID.
- Policy ID/version or policy snapshot.
- Overall notification state.
- Creation timestamp.
- Automatic/manual mode.
- Suppression or no-delivery reason.
- Engine processing metadata.

### 8.2 Delivery records

Each enabled channel and resolved recipient produces a separate Delivery record.

A delivery contains:

- Delivery ID.
- Notification ID.
- Channel.
- Audience/recipient type.
- Recipient identity.
- Destination snapshot.
- Template identity and version.
- Rendered content snapshot.
- Delivery status.
- Provider selection.
- Idempotency key.
- Attempt count.
- Relevant timestamps.
- Latest failure classification.

Example:

```text
Notification: Deposit Requested for Order TC-1004
  +-- Customer email delivery
  +-- Customer SMS delivery
  +-- Assigned staff in-app delivery
  +-- Owner in-app delivery
```

A failure in one branch does not erase or roll back successful branches.

## 9. Delivery Pipeline

### 9.1 Stage 1: Accept event

The engine validates the event type and establishes event idempotency.

If the same event has already been processed, the existing notification result is returned rather than creating a duplicate.

### 9.2 Stage 2: Evaluate policy

The engine loads the active policy applicable when the event occurred.

Possible outcomes:

- Policy disabled: record a no-delivery decision.
- Automatic disabled: record a pending/manual decision without dispatch.
- Automatic enabled: continue.
- No channels enabled: record a no-delivery decision.

A no-delivery policy decision is distinct from a delivery failure.

### 9.3 Stage 3: Resolve templates and recipients

For each enabled policy branch:

- Resolve audience.
- Resolve channel.
- Resolve recipient collection.
- Resolve template version.
- Build merge context.
- Render content.
- Validate destination and output.

Invalid branches are recorded individually. Valid branches continue.

### 9.4 Stage 4: Persist before dispatch

The engine durably creates:

- Notification record.
- Delivery records.
- Rendered content snapshots.
- Idempotency keys.
- Initial `queued` or non-dispatched states.

This persistence occurs before external provider execution.

### 9.5 Stage 5: Dispatch

The dispatcher claims eligible queued deliveries.

For each delivery, it:

1. Confirms the delivery remains eligible.
2. Selects the configured adapter for the channel.
3. Creates an attempt record.
4. Invokes the adapter.
5. Normalizes the adapter result.
6. Updates delivery and attempt state.
7. Schedules retry when appropriate.

The dispatcher does not re-evaluate business policy after a delivery has been created. The notification retains the policy decision made when the event was processed.

### 9.6 Stage 6: Provider callback and status updates

Where a provider later reports delivery state, the update is correlated using:

- Provider identity.
- Provider message ID.
- Delivery identity or provider metadata.

Callbacks update delivery state and append provider status history. They do not create a second business notification.

## 10. Delivery Lifecycle and Logging

### 10.1 Delivery statuses

The architecture distinguishes at least:

- `queued`: accepted and awaiting dispatch.
- `processing`: claimed by a dispatcher.
- `sent`: accepted by a provider or completed by an internal adapter.
- `delivered`: a provider confirms final delivery where supported.
- `failed`: an attempt or delivery failed.
- `retry_scheduled`: another attempt is planned.
- `not_deliverable`: no valid destination or content.
- `suppressed`: blocked by policy, recipient preference, or future compliance rule.
- `cancelled`: intentionally stopped before completion.

Not every provider can confirm `delivered`. In that case, `sent` remains the final known state. The engine does not manufacture delivery confirmation.

### 10.2 Delivery record fields

Each delivery records:

- Current status.
- Channel.
- Adapter/provider key.
- Provider message ID.
- Queued timestamp.
- Processing timestamp.
- Sent timestamp.
- Delivered timestamp.
- Failed timestamp.
- Next retry timestamp.
- Attempt count.
- Last failure code/category.
- Last failure reason.
- Created and updated timestamps.

### 10.3 Attempt records

Every adapter invocation produces an immutable Delivery Attempt record containing:

- Attempt ID.
- Delivery ID.
- Attempt number.
- Adapter/provider key.
- Started timestamp.
- Completed timestamp.
- Outcome.
- Provider message ID when returned.
- Normalized error category.
- Safe failure reason.
- Retryability decision.
- Provider response metadata appropriate for operations.

Provider secrets and unnecessary sensitive payloads are not logged.

### 10.4 Notification activity

The existing `notification_activity` concept evolves into the notification-level audit view or is mapped into it.

It currently preserves generated content and recipients, which remains valuable. Phase 2 adds actual delivery state rather than treating intended channels as proof of delivery.

### 10.5 Business audit questions

The completed logging model answers:

- Which business event caused this notification?
- Which Owner policy was applied?
- Which template version was used?
- Who was selected as a recipient?
- Which channels were attempted?
- Was each delivery queued, sent, delivered, failed, or suppressed?
- Which provider handled it?
- What provider identifier was returned?
- How many attempts occurred?
- Why did a delivery fail?
- Is another retry scheduled?

## 11. Idempotency

### 11.1 Idempotency layers

Duplicate protection is required at four separate layers.

#### Business-event idempotency

The same business occurrence creates only one Notification evaluation.

Identity is based on a stable business event ID or occurrence ID, not only the order number and event type.

This distinction allows legitimate repeated events, such as:

- A second payment request.
- A second failed payment.
- A later artwork revision cycle.

#### Notification idempotency

One event-policy evaluation produces one Notification record.

Conceptual identity:

```text
business event ID + policy identity/version
```

#### Delivery idempotency

Each recipient, channel, and template combination produces one delivery.

Conceptual identity:

```text
notification ID
+ channel
+ recipient identity
+ destination identity
+ template version
```

#### Attempt and provider idempotency

Retries of the same delivery use a stable delivery idempotency identity when the provider supports it.

A retry does not create a new business notification or a new logical delivery.

### 11.2 Atomic enforcement

Idempotency is enforced by durable uniqueness constraints or atomic claims, not solely by checking browser memory before writing.

The system remains safe when:

- Two workflow processes observe the same transition.
- A webhook is delivered more than once.
- A request is retried after a timeout.
- Two dispatch workers run concurrently.
- A provider succeeds but the application loses the immediate response.

### 11.3 Staff notifications

The current staff inbox uses random identifiers and must participate in the same delivery identity model.

For one business event, the same staff recipient does not receive duplicate in-app notifications due to repeated event processing.

### 11.4 Retry distinction

A retry is another attempt on the same delivery. It is not a new notification.

This distinction is essential for accurate counts, user experience, and provider idempotency.

## 12. Provider Abstraction

### 12.1 Adapter contract

Every delivery adapter accepts a provider-neutral delivery request containing:

- Delivery ID.
- Idempotency identity.
- Channel.
- Normalized destination.
- Rendered content.
- Sender configuration reference.
- Correlation metadata.

It returns a normalized result containing:

- Accepted or rejected outcome.
- Provider message ID.
- Known status.
- Retryable or terminal classification.
- Normalized error code.
- Safe error description.
- Provider metadata required for later correlation.

This is an architectural contract, not a provider API design.

### 12.2 Email adapter

The email adapter translates resolved email content into the active email provider's transport format.

It does not:

- Select the Order Approved template.
- Verify business approval policy.
- Build merge fields.
- Decide whether email is enabled.
- Write business events.

The existing Resend-specific delivery becomes an email adapter concern rather than a special branch inside the Notification Engine.

### 12.3 SMS adapter

The SMS adapter receives a resolved phone destination and rendered SMS body.

It does not know what Deposit Requested or Ready For Pickup means.

### 12.4 Staff/in-app adapter

The existing staff notification store becomes, or is wrapped by, an internal delivery adapter.

That adapter creates the durable inbox record and returns a normalized delivery result. Staff notification creation then participates in:

- Shared policy evaluation.
- Shared idempotency.
- Shared delivery logging.
- Shared recipient resolution.

Staff read/unread state remains a staff-inbox concern, separate from delivery status.

### 12.5 Future adapters

The same boundary can support:

- A replacement email provider.
- A replacement SMS provider.
- Push.
- Portal inbox.
- Webhook destinations.
- Additional internal channels.

Adding a provider does not require changes to business-event emitters or template-selection rules.

### 12.6 Provider selection

Provider selection belongs to channel configuration outside Notification Policy.

Policy says "send email." Delivery configuration says which email adapter currently handles email.

Changing providers does not require editing every business-event policy.

## 13. Separation of Responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Business workflow | Establishing business state and emitting events | Templates, provider calls, retries |
| Business Event store | Durable occurrence identity and payload | Delivery decisions |
| Notification Policy | Enabled behavior, channels, audiences, delivery mode | Message rendering, provider transport |
| Template service | Template identity, versions, content | Event detection, recipient lookup |
| Merge-context builder | Canonical business values | Provider payloads |
| Recipient resolver | Customer, staff, and owner destinations | Provider invocation |
| Notification Engine | Policy evaluation and delivery creation | Provider-specific behavior |
| Dispatcher | Claiming and executing queued deliveries | Business-event interpretation |
| Provider adapter | Transport translation and normalized result | Business policy |
| Delivery log | Status, attempts, provider correlation | Deciding what should be sent |
| Staff inbox | Staff presentation and read/unread state | Customer email or SMS delivery |

## 14. Existing Architecture Evolution

### 14.1 Retain

Phase 2 retains:

- Existing business-event identifiers.
- Existing event hooks and their business meanings.
- Existing email and SMS template content.
- Existing merge-field syntax.
- Existing template-management UI concepts.
- Existing Supabase template synchronization.
- Existing notification activity history.
- Existing staff notification inbox and read/unread experience.
- Existing basic idempotency intent.
- Existing Order Approved email behavior as a business requirement.

### 14.2 Evolve

The following current responsibilities evolve:

- Template channel flags become, or seed, explicit Notification Policy.
- Browser-side notification orchestration moves toward a durable engine boundary.
- The direct Order Approved email branch becomes generic dispatch through an email adapter.
- In-memory pending-delivery tracking is replaced by durable queued-delivery state.
- Notification activity is separated from delivery attempts and outcomes.
- Staff notification creation becomes a tracked internal delivery.
- Event/order-based idempotency becomes event-, delivery-, and attempt-level idempotency.
- Mutable templates gain immutable version identity.
- The disconnected portal-trigger configuration is reconciled with the canonical policy model rather than becoming a second policy system.

## 15. Failure Behavior

### 15.1 Policy or configuration failure

Examples include:

- No active policy.
- An enabled channel has no assigned template.
- Automatic delivery is disabled.

These are notification-decision outcomes, not provider failures.

### 15.2 Resolution failure

Examples include:

- Missing customer email.
- Missing phone number.
- Required merge field unavailable.
- No staff recipient matches routing rules.

The affected delivery is marked not deliverable or failed before dispatch. Other delivery branches continue.

### 15.3 Provider failure

A provider failure is recorded as a delivery-attempt outcome.

It is classified as:

- Retryable.
- Terminal.
- Indeterminate.

Retries remain attached to the original delivery.

### 15.4 Partial success

If email succeeds and SMS fails:

- The notification is partially successful.
- Email remains sent or delivered.
- SMS follows its retry or failure lifecycle.
- Staff delivery is unaffected.

No successful channel is repeated merely because another channel failed.

## 16. Ownership and Configuration Boundaries

### 16.1 Owner-controlled business policy

The Owner configures:

- Whether an event is enabled.
- Automatic delivery behavior.
- Enabled channels.
- Intended audiences.
- Template assignments.

This is normal business configuration.

### 16.2 Operational delivery configuration

System operations configure:

- Active adapter for each channel.
- Provider credentials.
- Sender identities.
- Runtime delivery availability.

Provider credentials and transport settings are not business policy and do not appear in per-event configuration.

### 16.3 Template management

Authorized users manage message content and published versions independently of provider selection.

## 17. Phase 2 Acceptance Model

The Notification Engine architecture is complete when the system can demonstrate the following independently of any particular provider:

1. A durable business event is accepted once.
2. The active policy is evaluated consistently.
3. Disabled channels generate no delivery.
4. Enabled channels create one delivery per resolved recipient.
5. The correct template version is selected.
6. Merge fields are rendered before dispatch.
7. Delivery records are durable before provider execution.
8. A dispatcher can claim queued deliveries safely.
9. Adapters return normalized results.
10. Every attempt is recorded.
11. Retries remain attached to the original delivery.
12. Duplicate event processing does not duplicate logical deliveries.
13. Staff delivery uses the same policy and logging foundation.
14. Historical records identify the policy and template version used.
15. Replacing a provider does not change business workflows or notification policy.

## 18. Final Architecture Decision

Tee & Co evolves its existing foundation into a policy-driven, provider-independent Notification Engine with three durable levels:

```text
Business Event
    +-- Notification policy evaluation
            +-- One or more channel/recipient deliveries
                    +-- One or more delivery attempts
```

The definitive separation is:

- **Events state what happened.**
- **Policies state what Tee & Co wants done.**
- **Templates state what should be communicated.**
- **Recipient resolvers determine who receives it.**
- **The dispatcher executes durable delivery work.**
- **Adapters communicate with providers.**
- **Delivery records and attempts state what actually happened.**

This completes the business architecture without redesigning the existing event catalogue, templates, merge fields, persistence, workflow hooks, or staff inbox.
