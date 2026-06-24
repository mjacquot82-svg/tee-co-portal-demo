# Tee & Co Master Plan

## Project Status

Tee & Co has reached a strong pre-launch operational state. The customer portal, owner workflows, staff workflows, production readiness, notifications foundation, canonical workflow state, and Square payment infrastructure are in place. The current focus is production hardening: moving remaining local-only operational data to durable storage, verifying Square sandbox behavior end to end, tightening deployment readiness, and preparing for a limited production pilot.

---

# ✅ Completed

## Customer Experience

- Customer portal foundation.
- Customer account and order visibility.
- Portal order detail.
- Customer artwork workflows.
- Customer quote approval workflows.
- Customer payment dashboard.
- Customer payment request detail.
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
- Owner reconciliation signals for Square payment issues.

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
- Square payment link generation.
- Square provider metadata persistence.
- Customer Pay Now support.
- Secure Square webhook endpoint.
- Square HMAC signature verification.
- Idempotent webhook processing.
- Payment state synchronization.
- Payment failed notification events.
- Payment reliability and reconciliation hardening.
- Out-of-order webhook protection.
- Duplicate payment detection.
- Manual plus Square payment conflict detection.
- Production gating protection for payment reconciliation issues.

## Production

- Production workflow foundation.
- Production Queue.
- Assign Work workflows.
- Production readiness indicators.
- Production status presentation cleanup.
- Production workflow reliability pass.
- Blocked order explanations.
- Readiness and blocker visibility.
- Production gating integration with canonical payment state.
- Completed order production action cleanup.

## Notifications

- Notification Templates foundation.
- Notification Framework.
- Notification Activity.
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
- Reconciliation helper layer.
- Supabase payment reliability indexes.
- Legacy compatibility layers for payments and deposits.

---

# 🚧 In Progress

- Square sandbox verification.
- Payment reliability validation.
- Production launch readiness review.
- Supabase persistence hardening.
- Operational data migration planning.
- Deployment environment verification.

---

# 🎯 Production Readiness

- [ ] Move Notification Templates from localStorage to Supabase.
- [ ] Move Staff Notifications from localStorage to Supabase.
- [ ] Persist Notification Activity server-side.
- [ ] Verify Supabase RLS for customers, orders, payments, notifications, and staff data.
- [ ] Verify Square webhook deployment URL.
- [ ] Verify Square webhook signature configuration.
- [ ] Apply Square payment reliability indexes in Supabase.
- [ ] Complete Square sandbox payment verification.
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

Status: Current

- Secure Square webhook endpoint.
- Square HMAC signature verification.
- Idempotent webhook processing.
- Payment state synchronization.
- Payment request synchronization.
- Payment event creation.
- Customer payment status updates.
- Production gating integration.
- Payment failed notification events.
- Payment reliability and reconciliation hardening.
- Duplicate webhook protection.
- Out-of-order webhook protection.
- Manual plus Square conflict detection.

## Phase 3

Status: Planned

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
- Optional terminal and in-store payment planning.

---

# 📬 Notifications

## Completed

- Notification Templates foundation.
- Notification Framework.
- Notification Activity.
- Staff Notification Center.
- Quote approval notifications.
- Artwork notifications.
- Deposit requested notifications.
- Payment request created notifications.
- Payment received notifications.
- Payment failed notification events.
- Production and pickup notification templates.

## Remaining

- Move Notification Templates from localStorage to Supabase.
- Move Staff Notifications from localStorage to Supabase.
- Persist Notification Activity server-side.
- Confirm notification visibility across devices.
- Add owner-facing notification delivery confidence.
- Verify notification template RLS.

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

- [ ] Customer portal smoke test.
- [ ] Customer order detail review.
- [ ] Customer quote approval review.
- [ ] Customer artwork workflow review.
- [ ] Customer payment flow sandbox test.
- [ ] Customer mobile testing.

## Owner

- [ ] Owner dashboard review.
- [ ] Owner order workflow review.
- [ ] Owner quote workflow review.
- [ ] Owner payment workflow review.
- [ ] Owner reconciliation workflow review.
- [ ] Owner production readiness review.

## Staff

- [ ] Staff login review.
- [ ] Staff assignments review.
- [ ] Staff notification center review.
- [ ] Staff production queue review.
- [ ] Staff blocked work review.
- [ ] Staff shop-device testing.

## Payments

- [ ] Square payment link sandbox test.
- [ ] Square successful payment webhook test.
- [ ] Square failed payment webhook test.
- [ ] Square duplicate webhook test.
- [ ] Square delayed webhook test.
- [ ] Manual payment compatibility test.
- [ ] Payment reconciliation review.

## Notifications

- [ ] Notification templates review.
- [ ] Staff notifications review.
- [ ] Payment notification review.
- [ ] Server-side notification persistence review.

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

- [ ] Run production build.
- [ ] Run payment tests.
- [ ] Run workflow tests.
- [ ] Run notification tests.
- [ ] Run production queue tests.
- [ ] Run browser smoke tests.

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
- LocalStorage migrations.
- Legacy compatibility layers.
- Bundle optimization.
- Supabase schema alignment.
- Test environment cleanup.
- Customer data fallback cleanup.
- Payment reconciliation polish.
- Notification persistence migration.
- Operational logging improvements.

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

Move operational notification data to Supabase and persist notification activity server-side.

## Second Priority

Complete Square sandbox verification, including successful payment, failed payment, delayed webhook, duplicate webhook, and manual payment conflict scenarios.

## Third Priority

Complete production launch readiness: RLS verification, deployment environment validation, multi-device testing, backups, and limited production pilot planning.
