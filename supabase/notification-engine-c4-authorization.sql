-- Notification Engine production-readiness remediation C4.
-- Additive authorization hardening only; notification behavior is unchanged.

create or replace function public.is_notification_engine_operational_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or lower(
      coalesce(
        auth.jwt() -> 'app_metadata' ->> 'operational_role',
        auth.jwt() -> 'app_metadata' ->> 'role',
        ''
      )
    ) = any (array['owner', 'manager', 'staff']);
$$;

create or replace function public.is_notification_engine_owner()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or lower(
      coalesce(
        auth.jwt() -> 'app_metadata' ->> 'operational_role',
        auth.jwt() -> 'app_metadata' ->> 'role',
        ''
      )
    ) = 'owner';
$$;

alter table public.notification_business_events enable row level security;
alter table public.notification_template_versions enable row level security;
alter table public.notification_policies enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_delivery_status_history enable row level security;

revoke all on table public.notification_business_events from anon, authenticated;
revoke all on table public.notification_template_versions from anon, authenticated;
revoke all on table public.notification_policies from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_deliveries from anon, authenticated;
revoke all on table public.notification_delivery_attempts from anon, authenticated;
revoke all on table public.notification_delivery_status_history from anon, authenticated;

grant select on table public.notification_business_events to authenticated;
grant select on table public.notification_template_versions to authenticated;
grant select on table public.notification_policies to authenticated;
grant select, insert, update on table public.notifications to authenticated;
grant select, insert, update on table public.notification_deliveries to authenticated;
grant select on table public.notification_delivery_attempts to authenticated;
grant select on table public.notification_delivery_status_history to authenticated;

grant all on table public.notification_business_events to service_role;
grant all on table public.notification_template_versions to service_role;
grant all on table public.notification_policies to service_role;
grant all on table public.notifications to service_role;
grant all on table public.notification_deliveries to service_role;
grant all on table public.notification_delivery_attempts to service_role;
grant all on table public.notification_delivery_status_history to service_role;

drop policy if exists "Operational users read notification business events"
  on public.notification_business_events;
create policy "Operational users read notification business events"
on public.notification_business_events
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notification template versions"
  on public.notification_template_versions;
create policy "Operational users read notification template versions"
on public.notification_template_versions
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notification policies"
  on public.notification_policies;
create policy "Operational users read notification policies"
on public.notification_policies
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notifications"
  on public.notifications;
create policy "Operational users read notifications"
on public.notifications
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational event processing creates notifications"
  on public.notifications;
create policy "Operational event processing creates notifications"
on public.notifications
for insert
to authenticated
with check (public.is_notification_engine_operational_user());

drop policy if exists "Operational event processing updates notifications"
  on public.notifications;
create policy "Operational event processing updates notifications"
on public.notifications
for update
to authenticated
using (public.is_notification_engine_operational_user())
with check (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notification deliveries"
  on public.notification_deliveries;
create policy "Operational users read notification deliveries"
on public.notification_deliveries
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational event processing creates pristine deliveries"
  on public.notification_deliveries;
create policy "Operational event processing creates pristine deliveries"
on public.notification_deliveries
for insert
to authenticated
with check (
  public.is_notification_engine_operational_user()
  and status in ('queued', 'not_deliverable', 'suppressed')
  and attempt_count = 0
  and provider_key = ''
  and provider_message_id = ''
  and claim_token = ''
  and claimed_at is null
  and claim_expires_at is null
  and processing_at is null
  and sent_at is null
  and delivered_at is null
  and failed_at is null
  and next_retry_at is null
);

drop policy if exists "Operational event processing updates pristine deliveries"
  on public.notification_deliveries;
create policy "Operational event processing updates pristine deliveries"
on public.notification_deliveries
for update
to authenticated
using (
  public.is_notification_engine_operational_user()
  and status in ('queued', 'not_deliverable', 'suppressed')
  and attempt_count = 0
  and provider_key = ''
  and provider_message_id = ''
  and claim_token = ''
  and claimed_at is null
  and claim_expires_at is null
)
with check (
  public.is_notification_engine_operational_user()
  and status in ('queued', 'not_deliverable', 'suppressed')
  and attempt_count = 0
  and provider_key = ''
  and provider_message_id = ''
  and claim_token = ''
  and claimed_at is null
  and claim_expires_at is null
  and processing_at is null
  and sent_at is null
  and delivered_at is null
  and failed_at is null
  and next_retry_at is null
);

drop policy if exists "Operational users read notification delivery attempts"
  on public.notification_delivery_attempts;
create policy "Operational users read notification delivery attempts"
on public.notification_delivery_attempts
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notification delivery history"
  on public.notification_delivery_status_history;
create policy "Operational users read notification delivery history"
on public.notification_delivery_status_history
for select
to authenticated
using (public.is_notification_engine_operational_user());

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
  v_updated_by text;
begin
  if not public.is_notification_engine_owner() then
    raise exception 'Owner authorization is required.'
      using errcode = '42501';
  end if;

  -- p_updated_by remains only for RPC signature compatibility. Audit identity
  -- comes from the authenticated database principal and cannot be impersonated.
  v_updated_by := coalesce(auth.uid()::text, 'service_role');

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
    v_updated_by
  )
  returning * into v_result;

  return v_result;
end;
$$;

alter view public.notification_engine_activity set (security_invoker = true);
alter view public.notification_engine_cutover_verification set (security_invoker = true);

revoke all on table public.notification_engine_activity from anon, authenticated;
revoke all on table public.notification_engine_cutover_verification from anon, authenticated;
grant select on table public.notification_engine_activity to authenticated, service_role;
grant select on table public.notification_engine_cutover_verification to authenticated, service_role;

do $$
declare
  privileged_function record;
begin
  for privileged_function in
    select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'set_notification_engine_updated_at',
         'record_notification_delivery_status_history',
         'refresh_notification_aggregate_status',
         'claim_notification_deliveries_observation',
         'recover_abandoned_notification_delivery_claims',
         'complete_notification_delivery_observation',
         'claim_staff_notification_deliveries_observation',
         'complete_staff_internal_delivery_observation',
         'claim_resend_email_deliveries_observation',
         'complete_resend_email_delivery_observation',
         'mark_notification_delivery_delivered',
         'cancel_notification_delivery',
         'claim_resend_email_delivery_cutover',
         'complete_resend_email_delivery_cutover'
       ])
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      privileged_function.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      privileged_function.signature
    );
  end loop;
end;
$$;

revoke all on function public.is_notification_engine_operational_user()
  from public, anon;
revoke all on function public.is_notification_engine_owner()
  from public, anon;
grant execute on function public.is_notification_engine_operational_user()
  to authenticated, service_role;
grant execute on function public.is_notification_engine_owner()
  to authenticated, service_role;

revoke all on function public.save_notification_policy_version(
  text, boolean, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_notification_policy_version(
  text, boolean, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, text
) to authenticated, service_role;
