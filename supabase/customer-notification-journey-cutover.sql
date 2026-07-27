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

-- Generalize authoritative Resend delivery from the original approval-only
-- cutover to every configured customer notification event. Eligibility still
-- requires an authoritative, non-observation Delivery.
create or replace function public.claim_resend_email_delivery_cutover(
  p_delivery_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  delivery jsonb,
  notification jsonb,
  business_event jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_token text;
begin
  if nullif(trim(p_delivery_id), '') is null
    or nullif(trim(p_worker_id), '') is null
  then
    raise exception 'Cutover Delivery and worker identities are required.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'resend-cutover:',
    p_worker_id,
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select delivery_row.id
    from public.notification_deliveries delivery_row
    join public.notifications notification_row
      on notification_row.id = delivery_row.notification_id
    where delivery_row.id = p_delivery_id
      and delivery_row.channel = 'email'
      and notification_row.delivery_mode = 'automatic'
      and coalesce(
        (notification_row.policy_snapshot ->> 'email_enabled')::boolean,
        false
      )
      and delivery_row.status in ('queued', 'retry_scheduled')
      and (
        delivery_row.next_retry_at is null
        or delivery_row.next_retry_at <= clock_timestamp()
      )
      and not coalesce(
        (notification_row.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and coalesce(
        (
          notification_row.engine_metadata
            #>> '{phase2D,dispatcherEligible}'
        )::boolean,
        false
      )
      and not coalesce(
        (delivery_row.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    for update of delivery_row skip locked
  ),
  claimed as (
    update public.notification_deliveries delivery_row
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp(),
      next_retry_at = null
    from eligible
    where delivery_row.id = eligible.id
    returning delivery_row.*
  )
  select
    to_jsonb(claimed),
    to_jsonb(notification_row),
    to_jsonb(event_row)
  from claimed
  join public.notifications notification_row
    on notification_row.id = claimed.notification_id
  join public.notification_business_events event_row
    on event_row.id = notification_row.business_event_id;
end;
$$;

create or replace function public.complete_resend_email_delivery_cutover(
  p_delivery_id text,
  p_claim_token text,
  p_attempt_id text,
  p_attempt_number integer,
  p_outcome text,
  p_retryability text,
  p_provider_message_id text,
  p_failure_code text,
  p_failure_reason text,
  p_provider_metadata jsonb,
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_max_delay_seconds integer,
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
  v_delivery_status text;
  v_retry_safe boolean;
  v_delay_seconds integer;
  v_next_retry_at timestamptz;
begin
  if nullif(trim(p_claim_token), '') is null
    or nullif(trim(p_attempt_id), '') is null
  then
    raise exception 'Resend Delivery completion identities are required.';
  end if;
  if p_outcome not in ('sent', 'failed') then
    raise exception 'Unsupported Resend outcome.';
  end if;
  if p_retryability not in (
    'retryable',
    'terminal',
    'indeterminate',
    'unknown'
  ) then
    raise exception 'Unsupported retryability classification.';
  end if;
  if p_attempt_number is null or p_attempt_number < 1 then
    raise exception 'Delivery attempt number must be positive.';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20
    or p_base_delay_seconds is null
    or p_base_delay_seconds < 1
    or p_base_delay_seconds > 86400
    or p_max_delay_seconds is null
    or p_max_delay_seconds < p_base_delay_seconds
    or p_max_delay_seconds > 604800
  then
    raise exception 'Invalid retry policy.';
  end if;

  select delivery_row.*
  into v_delivery
  from public.notification_deliveries delivery_row
  join public.notifications notification_row
    on notification_row.id = delivery_row.notification_id
  where delivery_row.id = p_delivery_id
    and delivery_row.channel = 'email'
    and notification_row.delivery_mode = 'automatic'
    and coalesce(
      (notification_row.policy_snapshot ->> 'email_enabled')::boolean,
      false
    )
    and not coalesce(
      (notification_row.engine_metadata ->> 'observationOnly')::boolean,
      true
    )
    and not coalesce(
      (delivery_row.destination_snapshot ->> 'observationOnly')::boolean,
      true
    )
  for update of delivery_row;

  if not found then
    raise exception 'Delivery is not eligible for authoritative Resend completion.';
  end if;

  if exists (
    select 1
    from public.notification_delivery_attempts
    where id = p_attempt_id
      and delivery_id = p_delivery_id
      and attempt_number = p_attempt_number
  ) then
    return v_delivery;
  end if;

  if v_delivery.status <> 'processing'
    or v_delivery.claim_token <> p_claim_token
    or v_delivery.claim_expires_at is null
    or v_delivery.claim_expires_at <= clock_timestamp()
  then
    raise exception 'Resend Delivery claim is no longer valid.';
  end if;

  insert into public.notification_delivery_attempts (
    id,
    delivery_id,
    attempt_number,
    provider_key,
    provider_idempotency_key,
    outcome,
    retryability,
    provider_message_id,
    failure_code,
    failure_reason,
    provider_metadata,
    started_at,
    completed_at
  )
  values (
    p_attempt_id,
    p_delivery_id,
    p_attempt_number,
    'resend',
    v_delivery.idempotency_key,
    p_outcome,
    p_retryability,
    coalesce(p_provider_message_id, ''),
    coalesce(p_failure_code, ''),
    coalesce(p_failure_reason, ''),
    coalesce(p_provider_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'observationOnly',
        false,
        'cutoverMode',
        'authoritative'
      ),
    p_started_at,
    p_completed_at
  );

  v_retry_safe := p_retryability = 'retryable'
    or (
      p_retryability = 'indeterminate'
      and nullif(trim(v_delivery.idempotency_key), '') is not null
    );
  v_delay_seconds := least(
    p_max_delay_seconds,
    (
      p_base_delay_seconds
      * power(2, greatest(0, p_attempt_number - 1))
    )::integer
  );
  v_delivery_status := case
    when p_outcome = 'sent' then 'sent'
    when v_retry_safe and p_attempt_number < p_max_attempts
      then 'retry_scheduled'
    else 'failed'
  end;
  v_next_retry_at := case
    when v_delivery_status = 'retry_scheduled'
      then p_completed_at + make_interval(secs => v_delay_seconds)
    else null
  end;

  update public.notification_deliveries
  set
    status = v_delivery_status,
    provider_key = 'resend',
    provider_message_id = case
      when nullif(trim(coalesce(p_provider_message_id, '')), '') is not null
        then p_provider_message_id
      else provider_message_id
    end,
    attempt_count = greatest(attempt_count, p_attempt_number),
    last_failure_code = case
      when p_outcome = 'failed' then coalesce(p_failure_code, '')
      else ''
    end,
    last_failure_reason = case
      when p_outcome = 'failed' then coalesce(p_failure_reason, '')
      else ''
    end,
    sent_at = case
      when p_outcome = 'sent' then p_completed_at
      else sent_at
    end,
    failed_at = case
      when v_delivery_status = 'failed' then p_completed_at
      else null
    end,
    next_retry_at = v_next_retry_at,
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  where id = p_delivery_id
  returning * into v_delivery;

  perform public.refresh_notification_aggregate_status(
    v_delivery.notification_id
  );

  return v_delivery;
end;
$$;

create or replace function public.recover_abandoned_notification_delivery_claims_authoritative(
  p_limit integer default 100
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
  v_recovered_status text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Dispatcher recovery limit must be between 1 and 500.';
  end if;

  for v_delivery in
    select delivery_row.*
    from public.notification_deliveries delivery_row
    join public.notifications notification_row
      on notification_row.id = delivery_row.notification_id
    where delivery_row.status = 'processing'
      and delivery_row.claim_expires_at is not null
      and delivery_row.claim_expires_at <= clock_timestamp()
      and delivery_row.channel = 'email'
      and notification_row.delivery_mode = 'automatic'
      and coalesce(
        (notification_row.policy_snapshot ->> 'email_enabled')::boolean,
        false
      )
      and not coalesce(
        (notification_row.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and not coalesce(
        (delivery_row.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    order by delivery_row.claim_expires_at, delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  loop
    v_recovered_status := case
      when v_delivery.attempt_count > 0 then 'retry_scheduled'
      else 'queued'
    end;

    update public.notification_deliveries
    set
      status = v_recovered_status,
      next_retry_at = case
        when v_recovered_status = 'retry_scheduled'
          then clock_timestamp()
        else null
      end,
      claim_token = '',
      claimed_at = null,
      claim_expires_at = null
    where id = v_delivery.id
    returning * into v_delivery;

    return next v_delivery;
  end loop;
end;
$$;

create or replace function public.claim_resend_email_deliveries_authoritative(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 60
)
returns table (
  delivery jsonb,
  notification jsonb,
  business_event jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_token text;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'Dispatcher worker id is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Dispatcher claim limit must be between 1 and 100.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'resend-authoritative:',
    trim(p_worker_id),
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select delivery_row.id
    from public.notification_deliveries delivery_row
    join public.notifications notification_row
      on notification_row.id = delivery_row.notification_id
    where delivery_row.channel = 'email'
      and notification_row.delivery_mode = 'automatic'
      and coalesce(
        (notification_row.policy_snapshot ->> 'email_enabled')::boolean,
        false
      )
      and (
        delivery_row.status = 'queued'
        or (
          delivery_row.status = 'retry_scheduled'
          and delivery_row.next_retry_at is not null
          and delivery_row.next_retry_at <= clock_timestamp()
        )
      )
      and not coalesce(
        (notification_row.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and coalesce(
        (
          notification_row.engine_metadata
            #>> '{phase2D,dispatcherEligible}'
        )::boolean,
        false
      )
      and not coalesce(
        (delivery_row.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    order by
      coalesce(
        delivery_row.next_retry_at,
        delivery_row.queued_at,
        delivery_row.created_at
      ),
      delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_deliveries delivery_row
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp(),
      next_retry_at = null
    from eligible
    where delivery_row.id = eligible.id
    returning delivery_row.*
  )
  select
    to_jsonb(claimed),
    to_jsonb(notification_row),
    to_jsonb(event_row)
  from claimed
  join public.notifications notification_row
    on notification_row.id = claimed.notification_id
  join public.notification_business_events event_row
    on event_row.id = notification_row.business_event_id;
end;
$$;

revoke all on function public.claim_resend_email_delivery_cutover(
  text, text, integer
) from public, anon, authenticated;
revoke all on function public.complete_resend_email_delivery_cutover(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.recover_abandoned_notification_delivery_claims_authoritative(
  integer
) from public, anon, authenticated;
revoke all on function public.claim_resend_email_deliveries_authoritative(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.claim_resend_email_delivery_cutover(
  text, text, integer
) to service_role;
grant execute on function public.complete_resend_email_delivery_cutover(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) to service_role;
grant execute on function public.recover_abandoned_notification_delivery_claims_authoritative(
  integer
) to service_role;
grant execute on function public.claim_resend_email_deliveries_authoritative(
  text, integer, integer
) to service_role;
