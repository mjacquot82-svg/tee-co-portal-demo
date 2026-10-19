-- Customer confirmation emails for actions customers take themselves (Oct 19, 2026).
-- Additive and idempotent; independent of the RLS phases (works before and after phase B).
-- Uses the existing notification engine: legacy template row (owner can edit it in Notifications),
-- an immutable published template version, and an email-only, customer-audience policy.
-- Plain-text emails in the same style as the existing customer journey; no prices or amounts.
-- "Quote approved" reuses the existing quote_approved template/policy (nothing added for it).
begin;

with confirmations (type, name, email_subject, email_body) as (
  values
    ('approval_changes_requested', 'Changes Requested (customer)',
     'We received your change request — {{order_number}}',
     E'Hi {{customer_name}},\n\nThanks — we''ve received your change request for order {{order_number}}.\n\nNo action is needed right now. Our team will review your notes and send you an updated proof.\n\nYou can follow your order here:\n{{portal_link}}\n\nThanks,\nThe {{company_name}} Team'),
    ('deposit_sent_noted', 'Deposit Sent Noted (customer)',
     'Thanks for sending your deposit — {{order_number}}',
     E'Hi {{customer_name}},\n\nThanks for letting us know you''ve sent the deposit for order {{order_number}}.\n\nNo action is needed. We''ll confirm by email once it has been received.\n\nYou can follow your order here:\n{{portal_link}}\n\nThanks,\nThe {{company_name}} Team'),
    ('artwork_uploaded', 'Artwork Received (customer)',
     'Artwork received — {{order_number}}',
     E'Hi {{customer_name}},\n\nWe''ve received your artwork for order {{order_number}}.\n\nNo action is needed. Our team will review it and let you know if anything else is required.\n\nYou can follow your order here:\n{{portal_link}}\n\nThanks,\nThe {{company_name}} Team'),
    ('artwork_upload_later', 'Artwork To Follow (customer)',
     'Artwork to follow — {{order_number}}',
     E'Hi {{customer_name}},\n\nWe''ve noted that you''ll send the artwork for order {{order_number}} later.\n\nAction required: when your artwork is ready, upload it from your customer portal:\n{{portal_link}}\n\nThanks,\nThe {{company_name}} Team'),
    ('artwork_help_requested', 'Artwork Help Requested (customer)',
     'We received your artwork help request — {{order_number}}',
     E'Hi {{customer_name}},\n\nThanks — we''ve received your request for help with the artwork for order {{order_number}}.\n\nNo action is needed. Our team will be in touch soon.\n\nYou can follow your order here:\n{{portal_link}}\n\nThanks,\nThe {{company_name}} Team')
),
legacy as (
  insert into public.notification_templates (type, name, email_subject, email_body, sms_message, email_enabled, sms_enabled, staff_notification_enabled)
  select type, name, email_subject, email_body, '', true, false, false from confirmations
  on conflict (type) do nothing
  returning type
),
versions as (
  insert into public.notification_template_versions (id, template_type, version, name, email_subject, email_body, sms_message,
    required_merge_fields, status, published_at, published_by, created_at)
  select type || ':v1', type, 1, name, email_subject, email_body, '',
    '["customer_name", "order_number", "portal_link", "company_name"]'::jsonb,
    'published', timezone('utc', now()), 'customer-confirmation-notifications', timezone('utc', now())
  from confirmations c
  where not exists (select 1 from public.notification_template_versions v where v.template_type = c.type)
  returning id
)
insert into public.notification_policies (id, event_type, version, enabled, delivery_mode, email_enabled, sms_enabled,
  staff_notification_enabled, customer_audience_enabled, staff_audience_enabled, owner_audience_enabled,
  channel_template_assignments, effective_from, updated_by)
select 'policy:' || type || ':v1', type, 1, true, 'automatic', true, false, false, true, false, false,
  jsonb_build_object('email', type || ':v1'), timezone('utc', now()) - interval '1 minute', 'customer-confirmation-notifications'
from confirmations c
where not exists (select 1 from public.notification_policies p where p.event_type = c.type);

-- Re-applying after the rollback switches the same policies back on.
update public.notification_policies
set enabled = true, delivery_mode = 'automatic', updated_at = timezone('utc', now()), updated_by = 'customer-confirmation-notifications'
where updated_by = 'customer-confirmation-notifications-rollback' and effective_to is null
  and event_type in ('approval_changes_requested','deposit_sent_noted','artwork_uploaded','artwork_upload_later','artwork_help_requested');
update public.notification_templates set email_enabled = true, updated_at = timezone('utc', now())
where email_enabled = false
  and type in ('approval_changes_requested','deposit_sent_noted','artwork_uploaded','artwork_upload_later','artwork_help_requested');

commit;
