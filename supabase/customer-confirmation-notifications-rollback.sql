-- Rollback for customer-confirmation-notifications.sql: stop these emails.
-- The policies are switched off. Template versions are immutable by design and stay (unused);
-- the legacy template rows are marked email-disabled. Nothing else is touched.
begin;
update public.notification_policies
set enabled = false, delivery_mode = 'disabled', updated_at = timezone('utc', now()),
    updated_by = 'customer-confirmation-notifications-rollback'
where event_type in ('approval_changes_requested','deposit_sent_noted','artwork_uploaded','artwork_upload_later','artwork_help_requested')
  and effective_to is null;
update public.notification_templates
set email_enabled = false, updated_at = timezone('utc', now())
where type in ('approval_changes_requested','deposit_sent_noted','artwork_uploaded','artwork_upload_later','artwork_help_requested');
commit;
