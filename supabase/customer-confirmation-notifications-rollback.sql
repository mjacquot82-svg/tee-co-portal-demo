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

-- Point quote_approved back at the latest version that is not ours (our version stays, unused).
update public.notification_policies p
set channel_template_assignments = (
      select coalesce(jsonb_object_agg(k, case when v #>> '{}' = ours.id then to_jsonb(prev.id) else v end), '{}'::jsonb)
      from jsonb_each(p.channel_template_assignments) as e(k, v)),
    updated_at = timezone('utc', now())
from (select id from public.notification_template_versions
      where template_type = 'quote_approved' and published_by = 'customer-confirmation-notifications') ours,
     (select id from public.notification_template_versions
      where template_type = 'quote_approved' and status = 'published' and published_by <> 'customer-confirmation-notifications'
      order by version desc limit 1) prev
where p.event_type = 'quote_approved' and p.effective_to is null;
commit;
