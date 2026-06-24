# Tee & Co Master Plan

## Project Status

Tee & Co is in the sandbox and production-pilot readiness stage. The customer, owner, staff, production, notification, and payment foundations are complete, including Square payment links, Square webhook synchronization, payment reliability hardening, notification persistence in Supabase, and the owner payment reconciliation workspace. The next project focus is a controlled end-to-end Square sandbox pilot, followed by production launch verification and the next Square lifecycle phase.

---

# ✅ Completed

## Customer Experience

- Customer portal foundation.
- Customer account and order visibility.
- Portal order detail.
- Portal action completion pass.
- Customer artwork workflows.
- Customer quote approval workflows.
- Customer payment dashboard.
- Customer payment request detail.
- Customer Portal Payments.
- Customer Pay Now support for Square payment links.
- Customer-friendly payment status presentation.
- Legacy deposit workflow compatibility.

## Owner Experience

- Owner dashboard and workflow visibility.
- Owner order detail workflows.
- Owner quote and approval workflows.
- Owner payment request workflows.
- Owner payment request detail.
- Owner next recommended action guidance.
- Owner workflow action completion pass.
- Owner production readiness and blocker visibility.
- Owner-facing payment confidence indicators.
- Owner payment reconciliation workspace.
- Owner payment exception queue.
- Owner reconciliation actions for payment review, duplicates, and false positives.

## Staff Experience

- Staff workspace foundation.
- Staff assignment visibility.
- Staff notification center.
- Staff production workflow visibility.
- Staff order and assignment operational context.
- Staff-friendly production readiness indicators.
- Blocked work explanations and next-action guidance.

## Payments

- Payments Foundation.
- Payment Requests.
- Payments.
- Payment Events.
- Admin Payments Module.
- Customer Portal Payments.
- Payment Request Detail.
- Canonical Payment & Workflow State Layer.
- Existing deposit workflow compatibility.
- Square Integration Phase 1: Payment Links.
- Square Integration Phase 2: Webhook Processing.
- Square Integration Phase 2A: Payment Reliability.
- Square Integration Phase 2B: Payment Reconciliation Workspace.
- Square provider metadata persistence.
- Secure Square webhook endpoint.
- Square HMAC signature verification.
- Idempotent webhook processing.
- Payment state synchronization.
- Payment failed notification events.
- Out-of-order webhook protection.
- Duplicate payment detection.
- Manual plus Square payment conflict detection.
- Payment exception visibility and reconciliation audit trail.
- Production gating protection for payment reconciliation issues.

## Production

- Production workflow foundation.
- Production Queue.
- Assign Work workflows.
- Production readiness indicators.
- Production status presentation cleanup.
- Production Workflow Reliability & Readiness Pass.
- Blocked order explanations.
- Readiness and blocker visibility.
- Production gating integration with canonical payment state.
- Completed order production action cleanup.

## Notifications

- Notification Templates.
- Notification Framework.
- Notification Activity.
- Notification Persistence Migration to Supabase.
- Staff Notification Center.
- Payment Requested notifications.
- Payment Received notifications.
- Payment Failed notification events.
- Customer and staff notification template support.

## Architecture

- Canonical Payment & Workflow State Layer.
- Workflow Unification Phase 1.
- Operational state presentation helpers.
- Customer portal data scoping.
- Payment provider metadata model.
- Square provider service foundation.
- Square webhook processor.
- Payment reconciliation helper layer.
- Supabase-backed notification persistence.
- Supabase payment reliability indexes.
- Legacy compatibility layers for payments and deposits.

---

# 🚧 In Progress

- Square sandbox pilot execution.
- Deployment environment verification.
- Supabase RLS verification.
- Multi-device launch testing.
- Limited internal production pilot planning.

---

# 🎯 Production Readiness

- [x] Move Notification Templates from localStorage to Supabase.
- [x] Move Staff Notifications from localStorage to Supabase.
- [x] Persist Notification Activity server-side.
- [x] Complete Production Workflow Reliability & Readiness Pass.
- [x] Complete Square payment reliability and reconciliation workspace.
- [ ] Verify Supabase RLS for customers, orders, payments, notifications, and staff data.
- [ ] Verify Square webhook deployment URL.
- [ ] Verify Square webhook signature configuration.
- [ ] Confirm Square payment reliability indexes in Supabase.
- [ ] Complete first end-to-end Square sandbox payment verification.
- [ ] Test delayed, duplicate, failed, and completed Square webhook scenarios in sandbox.
- [ ] Multi-device testing for customer, owner, and staff workflows.
- [ ] Validate customer portal behavior on mobile.
- [ ] Validate owner workflows on tablet and desktop.
- [ ] Validate staff production workflows on shop devices.
- [ ] Confirm backup and recovery process.
- [ ] Complete deployment environment checklist.
- [ ] Run limited production pilot.

---

# 💳 Square Integration

## Phase 1

Status: Completed

- Square payment link foundation.
- Square provider service.
- Payment link creation flow.
- Provider checkout URL persistence.
- Provider payment link ID persistence.
- Provider metadata persistence.
- Customer portal Pay Now support.
- Owner payment request provider visibility.

## Phase 2

Status: Completed

- Secure Square webhook endpoint.
- Square HMAC signature verification.
- Idempotent webhook processing.
- Payment state synchronization.
- Payment request synchronization.
- Payment event creation.
- Customer payment status updates.
- Production gating integration.
- Payment failed notification events.

## Phase 2A

Status: Completed

- Database-level payment idempotency.
- Atomic webhook processing.
- Out-of-order webhook protection.
- Duplicate webhook protection.
- Duplicate payment detection.
- Manual plus Square payment conflict detection.
- Payment confidence indicators.
- Production gating safety hardening.

## Phase 2B

Status: Completed

- Owner payment reconciliation workspace.
- Payment exception queue.
- Payment synchronization warnings.
- Safe webhook recovery and retry behavior.
- Payment reconciliation actions.
- Payment timeline and Square metadata visibility.
- Payment audit trail improvements.

## Phase 3

Status: Next Planned Phase

- Refunds.
- Partial refunds.
- Refund status presentation.
- Refund-related payment events.
- Refund-aware canonical payment state.
- Refund-aware production and owner workflows.
- Customer refund visibility.

## Phase 4

Status: Planned

- Chargebacks.
- Disputes.
- Advanced reconciliation workflows.
- Square dashboard reconciliation review.
- Expanded owner exception handling.

## Phase 5

Status: Future

- Square Terminal support.
- In-store payment workflows.
- Expanded payment provider reporting.

---

# 📬 Notifications

## Completed

- Notification Templates.
- Notification Framework.
- Notification Activity.
- Notification Persistence Migration to Supabase.
- Staff Notification Center.
- Quote approval notifications.
- Artwork notifications.
- Deposit requested notifications.
- Payment request created notifications.
- Payment received notifications.
- Payment failed notification events.
- Production and pickup notification templates.

## Remaining

- Confirm notification visibility across devices.
- Verify notification template RLS.
- Verify notification activity RLS.
- Add owner-facing notification delivery confidence.
- Review notification activity under limited pilot usage.

## Future

- Email delivery.
- SMS delivery.
- Customer notification preferences.
- Automatic payment reminders.
- Automatic pickup reminders.
- Notification delivery logs.
- Failed delivery handling.

---

# 🚀 Launch Checklist

## Customer

- [x] Customer portal foundation.
- [x] Customer order detail.
- [x] Customer payment request detail.
- [x] Customer Pay Now support.
- [ ] Customer portal smoke test.
- [ ] Customer quote approval review.
- [ ] Customer artwork workflow review.
- [ ] Customer payment flow sandbox test.
- [ ] Customer mobile testing.

## Owner

- [x] Owner workflow action completion pass.
- [x] Owner payment request workflows.
- [x] Owner reconciliation workspace.
- [x] Owner production readiness visibility.
- [ ] Owner dashboard review.
- [ ] Owner order workflow review.
- [ ] Owner payment workflow review.
- [ ] Owner reconciliation workflow review.
- [ ] Owner production readiness review.

## Staff

- [x] Staff notification center.
- [x] Staff assignment visibility.
- [x] Staff production workflow visibility.
- [x] Staff blocked work context.
- [ ] Staff login review.
- [ ] Staff assignments review.
- [ ] Staff notification center review.
- [ ] Staff production queue review.
- [ ] Staff shop-device testing.

## Payments

- [x] Square payment link foundation.
- [x] Square webhook processing.
- [x] Payment reliability hardening.
- [x] Payment reconciliation workspace.
- [ ] Square payment link sandbox test.
- [ ] Square successful payment webhook test.
- [ ] Square failed payment webhook test.
- [ ] Square duplicate webhook test.
- [ ] Square delayed webhook test.
- [ ] Manual payment compatibility test.
- [ ] Payment reconciliation review.

## Notifications

- [x] Notification templates.
- [x] Notification framework.
- [x] Staff notifications.
- [x] Server-side notification persistence.
- [ ] Notification templates review.
- [ ] Staff notifications review.
- [ ] Payment notification review.
- [ ] Notification cross-device review.

## Security

- [ ] Verify Supabase RLS.
- [ ] Verify Square secrets are server-side only.
- [ ] Verify webhook signature enforcement.
- [ ] Verify staff access controls.
- [ ] Verify customer data scoping.

## Backups

- [ ] Confirm Supabase backup process.
- [ ] Confirm export process for critical operational data.
- [ ] Confirm rollback plan.

## Testing

- [ ] Run production build before launch.
- [ ] Run payment regression tests before launch.
- [ ] Run workflow regression tests before launch.
- [ ] Run notification regression tests before launch.
- [ ] Run production queue regression tests before launch.
- [ ] Run browser smoke tests before launch.

## Deployment

- [ ] Verify environment variables.
- [ ] Verify Netlify functions.
- [ ] Verify Square webhook URL.
- [ ] Verify Supabase migrations.
- [ ] Verify production domain.
- [ ] Complete limited production pilot.

---

# 🛠 Technical Debt

- Repo-wide lint cleanup.
- Large Vite bundle warning.
- Remaining legacy compatibility layers.
- Remaining local fallback behavior.
- Remaining localStorage migrations for non-notification operational data, if still required.
- Supabase schema and RLS verification.
- Test environment cleanup.
- Customer data fallback cleanup.
- Payment reconciliation polish after sandbox testing.
- Operational logging and monitoring improvements.
- Unrelated known repo issues should remain isolated from launch-critical payment work.

---

# 💡 Future Ideas

- Email delivery.
- SMS delivery.
- Customer notification preferences.
- Automated payment reminders.
- Automated pickup reminders.
- Refund workflows.
- Partial refund workflows.
- Chargeback workflows.
- Dispute workflows.
- Square Terminal support.
- In-store payment workflows.
- Advanced production analytics.
- Customer reorder tools.
- Owner financial reporting.
- Staff performance reporting.
- Inventory-aware production planning.
- Customer self-service artwork replacement.

---

# 📅 Next Recommended Work

## Top Priority

Execute the first end-to-end Square sandbox pilot, including payment request creation, customer Pay Now checkout, webhook synchronization, canonical payment state updates, production gating, notifications, and reconciliation workspace validation.

## Second Priority

Implement Square Refunds and Partial Refunds after the sandbox pilot confirms the core payment lifecycle is reliable.

## Third Priority

Complete production pilot readiness: Supabase RLS verification, deployment environment validation, multi-device testing, backups, monitoring, and limited production pilot planning.
