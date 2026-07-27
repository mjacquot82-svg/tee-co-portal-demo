-- Publish the cohesive customer lifecycle notification journey.
-- Existing Notifications and Deliveries retain their immutable snapshots.

with journey (
  type,
  name,
  email_subject,
  email_body,
  sms_message,
  required_merge_fields
) as (
  values
    (
      'quote_approved',
      'Order Approved',
      'Order approved — {{order_number}}',
      E'Hi {{customer_name}},\n\nYour order {{order_number}} has been approved.\n\nNo action is needed. We''ll let you know when it enters production.\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, order {{order_number}} is approved. No action is needed. We''ll let you know when production begins.',
      '["customer_name", "order_number", "company_name"]'::jsonb
    ),
    (
      'deposit_requested',
      'Deposit Requested',
      'Deposit required for order {{order_number}}',
      E'Hi {{customer_name}},\n\nA deposit of {{deposit_amount}} is now required for order {{order_number}} before production can be scheduled.\n\nAction required: submit your deposit here:\n{{payment_link}}\n\nWe''ll confirm when it is received.\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, a {{deposit_amount}} deposit is required for order {{order_number}} before production can be scheduled. Pay here: {{payment_link}}',
      '["customer_name", "order_number", "deposit_amount", "payment_link", "company_name"]'::jsonb
    ),
    (
      'payment_received',
      'Payment Received',
      'Deposit received — {{order_number}}',
      E'Hi {{customer_name}},\n\nWe''ve received your {{deposit_amount}} deposit for order {{order_number}}.\n\nNo action is needed. We''ll notify you when production begins.\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, we received your {{deposit_amount}} deposit for order {{order_number}}. No action is needed; we''ll notify you when production begins.',
      '["customer_name", "order_number", "deposit_amount", "company_name"]'::jsonb
    ),
    (
      'order_in_production',
      'Order In Production',
      'Your order has entered production — {{order_number}}',
      E'Hi {{customer_name}},\n\nYour order {{order_number}} has entered production.\n\nNo action is needed. We''ll notify you when it is ready for pickup.\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, order {{order_number}} has entered production. No action is needed; we''ll let you know when it''s ready for pickup.',
      '["customer_name", "order_number", "company_name"]'::jsonb
    ),
    (
      'order_ready_for_pickup',
      'Order Ready For Pickup',
      'Your order is ready for pickup — {{order_number}}',
      E'Hi {{customer_name}},\n\nYour order {{order_number}} is ready for pickup.\n\nAction required: please arrange to pick it up. Your remaining balance is {{balance_due}}.\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, order {{order_number}} is ready for pickup. Please arrange pickup; your remaining balance is {{balance_due}}.',
      '["customer_name", "order_number", "balance_due", "company_name"]'::jsonb
    ),
    (
      'order_completed',
      'Order Completed',
      'Order complete — {{order_number}}',
      E'Hi {{customer_name}},\n\nYour order {{order_number}} has been completed.\n\nNo action is needed. Thank you for choosing {{company_name}} — we hope you enjoy your order!\n\nThanks,\nThe {{company_name}} Team',
      'Hi {{customer_name}}, order {{order_number}} is complete. No action is needed. Thanks for choosing {{company_name}}!',
      '["customer_name", "order_number", "company_name"]'::jsonb
    )
)
update public.notification_templates template
set
  name = journey.name,
  email_subject = journey.email_subject,
  email_body = journey.email_body,
  sms_message = journey.sms_message,
  email_enabled = true,
  sms_enabled = true,
  updated_at = timezone('utc', now())
from journey
where template.type = journey.type;

with journey (
  type,
  name,
  email_subject,
  email_body,
  sms_message,
  required_merge_fields
) as (
  select
    template.type,
    template.name,
    template.email_subject,
    template.email_body,
    template.sms_message,
    case template.type
      when 'deposit_requested' then
        '["customer_name", "order_number", "deposit_amount", "payment_link", "company_name"]'::jsonb
      when 'payment_received' then
        '["customer_name", "order_number", "deposit_amount", "company_name"]'::jsonb
      when 'order_ready_for_pickup' then
        '["customer_name", "order_number", "balance_due", "company_name"]'::jsonb
      else
        '["customer_name", "order_number", "company_name"]'::jsonb
    end
  from public.notification_templates template
  where template.type in (
    'quote_approved',
    'deposit_requested',
    'payment_received',
    'order_in_production',
    'order_ready_for_pickup',
    'order_completed'
  )
),
next_versions as (
  select
    journey.*,
    coalesce((
      select max(version.version)
      from public.notification_template_versions version
      where version.template_type = journey.type
    ), 0) + 1 as version
  from journey
),
published as (
  insert into public.notification_template_versions (
    id,
    template_type,
    version,
    name,
    email_subject,
    email_body,
    sms_message,
    required_merge_fields,
    status,
    published_at,
    published_by,
    created_at
  )
  select
    concat(next_versions.type, ':v', next_versions.version),
    next_versions.type,
    next_versions.version,
    next_versions.name,
    next_versions.email_subject,
    next_versions.email_body,
    next_versions.sms_message,
    next_versions.required_merge_fields,
    'published',
    timezone('utc', now()),
    'customer-notification-journey-cutover',
    timezone('utc', now())
  from next_versions
  where not exists (
    select 1
    from public.notification_template_versions existing
    where existing.template_type = next_versions.type
      and existing.status = 'published'
      and existing.email_subject = next_versions.email_subject
      and existing.email_body = next_versions.email_body
      and existing.sms_message = next_versions.sms_message
  )
  returning id, template_type
)
select count(*) from published;

with latest_journey_versions as (
  select distinct on (version.template_type)
    version.template_type,
    version.id
  from public.notification_template_versions version
  where version.template_type in (
    'quote_approved',
    'deposit_requested',
    'payment_received',
    'order_in_production',
    'order_ready_for_pickup',
    'order_completed'
  )
    and version.status = 'published'
  order by version.template_type, version.version desc
)
update public.notification_policies policy
set
  sms_enabled = true,
  channel_template_assignments =
    coalesce(policy.channel_template_assignments, '{}'::jsonb)
    || case
      when policy.email_enabled
        then jsonb_build_object('email', latest.id)
      else '{}'::jsonb
    end
    || jsonb_build_object('sms', latest.id)
    || case
      when policy.staff_notification_enabled
        then jsonb_build_object('staff', latest.id)
      else '{}'::jsonb
    end,
  updated_at = timezone('utc', now())
from latest_journey_versions latest
where policy.event_type = latest.template_type
  and policy.effective_to is null;
