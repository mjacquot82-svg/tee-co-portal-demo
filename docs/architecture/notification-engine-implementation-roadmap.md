# Notification Engine Phase 2 Implementation Roadmap

## Document authority

This roadmap translates the approved
`docs/architecture/notification-engine-phase2.md` architecture into bounded
implementation phases. The architecture document remains authoritative for
business and system design. This document governs implementation order, scope,
dependencies, compatibility, and completion criteria.

The roadmap preserves existing notification templates, Legacy Notification
Activity, Staff Inbox behavior, and the Order Approved Resend behavior while
the durable engine is introduced and verified.

## Baseline assessment

At the start of Phase 2, Tee & Co already had:

- a supported business-event catalogue and workflow hooks;
- mutable email, SMS, and Staff template content;
- merge tokens and previews;
- persisted templates and configuration;
- Legacy Notification Activity;
- Staff Inbox notifications;
- a partial Order Approved Resend integration; and
- limited event-level idempotency.

The baseline was partial rather than a production Notification Engine because
policy, immutable resolution, recipient branches, durable Deliveries,
dispatcher execution, provider abstraction, retry lifecycle, and
delivery-aware operations were not yet one authoritative pipeline.

## Status legend

- **Implemented:** the approved responsibility is present.
- **Partially implemented:** useful baseline behavior existed but required
  additive completion.
- **Refactoring only:** behavior was retained behind a new boundary.
- **Missing:** the responsibility did not exist durably.
- **Retained unchanged:** existing behavior remained authoritative during the
  relevant phase.

## Architectural-area assessment

| Area | Baseline status | Required evolution | Completion phase |
|---|---|---|---|
| Business Events | Partially implemented | Durable catalogue identities, acceptance, and workflow linkage | 2A, 2B, 2I |
| Notification Policy | Partially implemented | Versioned event policy separated from content | 2A, 2B, 2H |
| Templates | Partially implemented | Immutable published versions and channel assignment | 2A, 2C, 2H |
| Merge Fields | Partially implemented | Canonical event contexts and required-token rejection | 2C |
| Recipient Resolution | Missing as a canonical service | Customer, Staff, Owner, and channel collections | 2D |
| Notification Creation | Missing as a durable aggregate | One policy-evaluation record with snapshots | 2B–2D |
| Delivery Records | Missing | One durable branch per channel and resolved recipient | 2D |
| Dispatcher | Missing | Claims, leases, Attempts, and adapter boundary | 2E |
| Delivery Logging | Partially implemented | Durable lifecycle and provider evidence | 2E–2G |
| Retry Handling | Missing | Bounded backoff, recovery, and immutable retry Attempts | 2G |
| Idempotency | Partially implemented | Event, Notification, Delivery, Attempt, and provider layers | 2A–2G |
| Provider Abstraction | Missing | Provider-neutral adapter contract | 2E–2F |
| Resend Integration | Implemented but coupled | Retain behavior while moving transport behind email adapter | 2F |
| Staff Notifications | Implemented | Retain UX while wrapping Staff Inbox as internal adapter | 2E |
| Activity History | Partially implemented | Preserve Legacy history and add Delivery-aware operations | 2H |
| Database Schema | Partially implemented | Add durable engine aggregates, versions, lifecycle, and controls | 2A–2H |

## Phase 2A — Durable foundation

**Objective:** Introduce additive schema and domain primitives without changing
runtime notification behavior.

**Scope:**

- business-event catalogue and identity;
- versioned Notification Policies;
- immutable template-version storage;
- Notifications, Deliveries, and Delivery Attempts;
- foundational uniqueness and status constraints; and
- additive migrations and seed compatibility.

**Likely files:** foundation domain modules, engine repository modules, and the
Phase 2A Supabase migration.

**Dependencies:** approved architecture and existing template/event catalogue.

**Estimated complexity:** Large.

**Completion state:** Implemented. Existing runtime remained authoritative.

## Phase 2B — Observation-only event and policy evaluation

**Objective:** Observe supported workflow events and persist policy decisions
without becoming authoritative.

**Scope:**

- default-off shadow flag;
- durable Business Event and Notification creation;
- policy resolution and policy snapshots;
- event/Notification idempotency; and
- resolution-failure evidence.

**Likely files:** workflow hooks, Phase 2B orchestration and repository modules,
environment documentation, tests, and additive migration.

**Dependencies:** Phase 2A.

**Estimated complexity:** Large.

**Risk control:** Default-off, non-authoritative, dual-compatible execution.

**Completion state:** Implemented.

## Phase 2C — Published template resolution and canonical rendering

**Objective:** Resolve immutable published content and render it before any
recipient or delivery work.

**Scope:**

- published template-version resolution;
- canonical event-specific merge contexts;
- required versus optional field validation;
- rejection of unresolved required tokens;
- rendered subject/body snapshots;
- pre-dispatch resolution failures; and
- separation of channel policy from template content.

**Likely files:** template resolution, merge-context, Phase 2C orchestration and
repository modules, tests, and template-version migration.

**Dependencies:** Phase 2B Notifications and Phase 2A template versions.

**Estimated complexity:** Large.

**Completion state:** Implemented. Existing editor and delivery behavior were
preserved.

## Phase 2D — Recipient resolution and durable Delivery planning

**Objective:** Materialize the exact delivery branches selected by policy.

**Scope:**

- canonical Customer, Staff, and Owner audiences;
- channel-specific recipient collections;
- recipient and destination snapshots;
- durable Delivery creation;
- Delivery-level idempotency;
- not-deliverable and suppressed outcomes; and
- Notification aggregate calculation.

**Likely files:** recipient-resolution service, Phase 2D orchestration,
foundation/repository modules, tests, and additive migration.

**Dependencies:** resolved content from Phase 2C.

**Estimated complexity:** Major.

**Risk control:** observation-only Deliveries; no production dispatch.

**Completion state:** Implemented.

## Phase 2E — Dispatcher foundation and Staff Internal Adapter

**Objective:** Establish provider-independent dispatch and prove the adapter
contract with the internal Staff channel.

**Scope:**

- atomic claiming and leases;
- eligibility and abandoned-claim recovery;
- immutable Delivery Attempt creation;
- dispatcher state transitions and idempotency;
- observation-only execution; and
- Staff Inbox adapter with linked identities and unchanged UX.

**Likely files:** dispatcher repository/service, Staff adapter and store,
dispatcher and Staff migrations, and regression tests.

**Dependencies:** durable Deliveries from Phase 2D.

**Estimated complexity:** Major.

**Completion state:** Implemented.

## Phase 2F — Resend Adapter Migration

**Objective:** Move existing Order Approved email transport behind the
provider-neutral adapter without changing its production behavior.

**Scope:**

- stored recipient and rendered content consumption;
- configured sender preservation;
- provider idempotency;
- normalized success/failure;
- provider message ID persistence;
- dispatcher completion; and
- parity with the Legacy Order Approved path.

**Likely files:** Resend adapter, dispatcher integration, existing customer
notification function, tests, and additive migration where required.

**Dependencies:** Phase 2E adapter contract.

**Estimated complexity:** Large.

**Risk control:** Legacy path remained authoritative until verified.

**Completion state:** Implemented.

## Phase 2G — Retry and Delivery lifecycle

**Objective:** Complete durable Delivery and Attempt state management.

**Scope:**

- queued, processing, sent, delivered, failed, retry-scheduled,
  not-deliverable, suppressed, and cancelled states;
- configurable bounded exponential backoff;
- immutable retry Attempts on the original Delivery;
- terminal, retryable, and indeterminate classifications;
- expired-claim recovery;
- status history; and
- aggregate preservation across independently successful channels.

**Likely files:** lifecycle domain service, dispatcher/adapters only where
required by the lifecycle contract, tests, and lifecycle migration.

**Dependencies:** Phase 2E dispatcher and Phase 2F adapter result contract.

**Estimated complexity:** Major.

**Completion state:** Implemented.

## Phase 2H — Owner administration and operational activity

**Objective:** Provide the canonical Owner policy surface and Delivery-aware
operational history.

**Scope:**

- policy administration for enabled, automatic, audiences, channels, and
  template assignments;
- content-only preservation of the template editor;
- reconciliation of Legacy trigger configuration;
- Notification, Delivery, Attempt, retry, provider, failure, and timestamp
  visibility; and
- backward-compatible Legacy history.

**Likely files:** Owner policy and activity pages, administration services,
activity repository/view, tests, and Owner-administration migration.

**Dependencies:** complete durable lifecycle through Phase 2G.

**Estimated complexity:** Large.

**Completion state:** Implemented.

## Phase 2I — Controlled cutover and Legacy retirement

**Objective:** Verify durable cardinality and incrementally transfer authority
without changing unsupported events.

**Scope:**

- exactly one Business Event per supported occurrence;
- exactly one Notification per evaluation;
- exact enabled channel/recipient Delivery cardinality;
- disabled-channel exclusion;
- aggregate-state parity;
- Legacy, Verify, and Authoritative modes;
- rollback controls;
- retirement of in-memory pending-delivery tracking and duplicated
  orchestration after parity; and
- read-only preservation of Legacy history.

**Likely files:** cutover controller, workflow integration points, verification
view and verifier, tests, environment documentation, and cutover migration.

**Dependencies:** Phases 2A–2H and recorded parity evidence.

**Estimated complexity:** Major.

**Completion state:** Implemented with Order Approved as the only approved
authoritative external email event.

## Dependency sequence

```text
2A Foundation
  → 2B Event/policy observation
  → 2C Template resolution
  → 2D Recipients and Deliveries
  → 2E Dispatcher and Staff adapter
  → 2F Resend adapter migration
  → 2G Retry lifecycle
  → 2H Owner operations
  → 2I Verification and controlled cutover
```

Each phase is additive, independently testable, and leaves the application
functional. A later phase may fix a defect in a frozen earlier phase only when
the defect blocks the later phase’s approved responsibility.

## Production transition constraints

- Legacy remains the rollback mode.
- Verify creates durable observation evidence without provider execution.
- Authoritative execution is restricted to explicitly approved events and
  channels.
- Provider credentials and service-role operations remain server-only.
- SMS and Twilio are not activated by this roadmap.
- Legacy Notification Activity remains read-only audit history.
- Schema changes remain additive throughout Phase 2.

## Roadmap completion

Phase 2A through Phase 2I are complete. Production readiness is governed by
`docs/testing/notification-engine-production-verification.md`, including
durable expectations, parity gates, controlled two-gate activation, rollback,
provider reconciliation, and operational monitoring.
