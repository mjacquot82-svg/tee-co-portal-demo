-- Notification Engine Phase 2H: Owner policy administration and operational activity.
-- Additive only. Runtime event observation and dispatcher scheduling remain unchanged.

create or replace function public.save_notification_policy_version(
  p_event_type text,
  p_enabled boolean,
  p_delivery_mode text,
  p_email_enabled boolean,
  p_sms_enabled boolean,
  p_staff_notification_enabled boolean,
  p_customer_audience_enabled boolean,
  p_staff_audience_enabled boolean,
  p_owner_audience_enabled boolean,
  p_channel_template_assignments jsonb,
  p_updated_by text default ''
)
returns public.notification_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_version integer;
  v_result public.notification_policies;
begin
  if coalesce(trim(p_event_type), '') = '' then
    raise exception 'A business event type is required.';
  end if;
  if p_delivery_mode not in ('automatic', 'approval_required', 'disabled') then
    raise exception 'Unsupported delivery mode.';
  end if;
  if p_enabled and not (
    p_customer_audience_enabled or p_staff_audience_enabled or p_owner_audience_enabled
  ) then
    raise exception 'An enabled policy requires at least one audience.';
  end if;
  if p_email_enabled and coalesce(trim(p_channel_template_assignments ->> 'email'), '') = '' then
    raise exception 'Email requires a template assignment.';
  end if;
  if p_sms_enabled and coalesce(trim(p_channel_template_assignments ->> 'sms'), '') = '' then
    raise exception 'SMS requires a template assignment.';
  end if;
  if p_staff_notification_enabled and coalesce(trim(p_channel_template_assignments ->> 'staff'), '') = '' then
    raise exception 'Staff notification requires a template assignment.';
  end if;
  if exists (
    select 1
    from jsonb_each_text(coalesce(p_channel_template_assignments, '{}'::jsonb)) assignment
    where assignment.key in ('email', 'sms', 'staff')
      and coalesce(trim(assignment.value), '') <> ''
      and not exists (
        select 1
        from public.notification_template_versions template
        where template.id = assignment.value
          and template.status = 'published'
      )
  ) then
    raise exception 'Template assignments must reference published template versions.';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification-policy:' || trim(p_event_type)));
  select coalesce(max(version), 0) + 1
    into v_version
    from public.notification_policies
   where event_type = trim(p_event_type);

  update public.notification_policies
     set effective_to = v_now,
         updated_at = v_now
   where event_type = trim(p_event_type)
     and effective_to is null;

  insert into public.notification_policies (
    id,
    event_type,
    version,
    enabled,
    delivery_mode,
    email_enabled,
    sms_enabled,
    staff_notification_enabled,
    customer_audience_enabled,
    staff_audience_enabled,
    owner_audience_enabled,
    channel_template_assignments,
    effective_from,
    updated_by
  )
  values (
    concat('policy:', trim(p_event_type), ':v', v_version),
    trim(p_event_type),
    v_version,
    p_enabled,
    p_delivery_mode,
    p_email_enabled,
    p_sms_enabled,
    p_staff_notification_enabled,
    p_customer_audience_enabled,
    p_staff_audience_enabled,
    p_owner_audience_enabled,
    coalesce(p_channel_template_assignments, '{}'::jsonb),
    v_now,
    coalesce(trim(p_updated_by), '')
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace view public.notification_engine_activity as
select
  n.id as notification_id,
  n.event_type,
  n.subject_type,
  n.subject_id,
  n.status as notification_status,
  n.status as aggregate_state,
  n.policy_snapshot,
  n.created_at as notification_created_at,
  n.updated_at as notification_updated_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'channel', d.channel,
        'recipient_type', d.recipient_type,
        'recipient_key', d.recipient_key,
        'recipient_snapshot', d.recipient_snapshot,
        'destination_key', d.destination_key,
        'destination_snapshot', d.destination_snapshot,
        'status', d.status,
        'provider_key', d.provider_key,
        'provider_message_id', d.provider_message_id,
        'attempt_count', d.attempt_count,
        'last_failure_code', d.last_failure_code,
        'last_failure_reason', d.last_failure_reason,
        'queued_at', d.queued_at,
        'processing_at', d.processing_at,
        'sent_at', d.sent_at,
        'delivered_at', d.delivered_at,
        'failed_at', d.failed_at,
        'next_retry_at', d.next_retry_at,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'attempts', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'attempt_number', a.attempt_number,
              'provider_key', a.provider_key,
              'outcome', a.outcome,
              'retryability', a.retryability,
              'provider_message_id', a.provider_message_id,
              'failure_code', a.failure_code,
              'failure_reason', a.failure_reason,
              'started_at', a.started_at,
              'completed_at', a.completed_at
            )
            order by a.attempt_number
          )
          from public.notification_delivery_attempts a
          where a.delivery_id = d.id
        ), '[]'::jsonb)
      )
      order by d.created_at
    ) filter (where d.id is not null),
    '[]'::jsonb
  ) as deliveries
from public.notifications n
left join public.notification_deliveries d on d.notification_id = n.id
group by n.id;
