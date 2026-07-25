-- Notification Engine Phase 2A: additive durable data foundation.
--
-- This migration intentionally does not alter or remove the existing
-- notification_templates, notification_activity, or staff_notifications
-- runtime paths. Phase 2B will begin writing business events and notifications.

create or replace function public.set_notification_engine_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Immutable business occurrences accepted by the Notification Engine.
create table if not exists public.notification_business_events (
  id text primary key,
  event_type text not null,
  subject_type text not null,
  subject_id text not null,
  occurrence_id text not null,
  correlation_id text not null default '',
  source text not null default '',
  actor_type text not null default 'system',
  actor_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  accepted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint notification_business_events_occurrence_unique
    unique (event_type, subject_type, subject_id, occurrence_id)
);

create index if not exists notification_business_events_subject_idx
  on public.notification_business_events (subject_type, subject_id, occurred_at desc);

create index if not exists notification_business_events_correlation_idx
  on public.notification_business_events (correlation_id)
  where correlation_id <> '';

-- Stable template identities remain the existing notification template types.
-- Versions are immutable snapshots of their channel content.
create table if not exists public.notification_template_versions (
  id text primary key,
  template_type text not null,
  version integer not null check (version > 0),
  name text not null default '',
  email_subject text not null default '',
  email_body text not null default '',
  sms_message text not null default '',
  required_merge_fields jsonb not null default '[]'::jsonb,
  status text not null default 'published'
    check (status in ('draft', 'published', 'superseded')),
  published_at timestamptz,
  published_by text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  constraint notification_template_versions_type_version_unique
    unique (template_type, version)
);

create index if not exists notification_template_versions_published_idx
  on public.notification_template_versions (template_type, version desc)
  where status = 'published';

-- Owner-controlled notification behavior. V1 permits one currently effective
-- policy row per business event while retaining prior versions.
create table if not exists public.notification_policies (
  id text primary key,
  event_type text not null,
  version integer not null check (version > 0),
  enabled boolean not null default true,
  delivery_mode text not null default 'automatic'
    check (delivery_mode in ('automatic', 'approval_required', 'disabled')),
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  staff_notification_enabled boolean not null default false,
  customer_audience_enabled boolean not null default true,
  staff_audience_enabled boolean not null default false,
  owner_audience_enabled boolean not null default false,
  channel_template_assignments jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default timezone('utc', now()),
  effective_to timestamptz,
  updated_by text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_policies_event_version_unique
    unique (event_type, version),
  constraint notification_policies_effective_range_valid
    check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists notification_policies_one_current_event_idx
  on public.notification_policies (event_type)
  where effective_to is null;

drop trigger if exists notification_policies_updated_at
  on public.notification_policies;
create trigger notification_policies_updated_at
  before update on public.notification_policies
  for each row execute procedure public.set_notification_engine_updated_at();

-- One policy evaluation for one accepted business event.
create table if not exists public.notifications (
  id text primary key,
  business_event_id text not null
    references public.notification_business_events(id),
  event_type text not null,
  subject_type text not null,
  subject_id text not null,
  correlation_id text not null default '',
  policy_id text not null references public.notification_policies(id),
  policy_version integer not null check (policy_version > 0),
  policy_snapshot jsonb not null default '{}'::jsonb,
  delivery_mode text not null
    check (delivery_mode in ('automatic', 'approval_required', 'disabled')),
  status text not null default 'evaluated'
    check (
      status in (
        'evaluated',
        'pending_approval',
        'queued',
        'partially_successful',
        'completed',
        'no_delivery',
        'failed'
      )
    ),
  no_delivery_reason text not null default '',
  engine_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notifications_event_policy_unique
    unique (business_event_id, policy_id, policy_version)
);

create index if not exists notifications_subject_idx
  on public.notifications (subject_type, subject_id, created_at desc);

drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at
  before update on public.notifications
  for each row execute procedure public.set_notification_engine_updated_at();

-- One logical channel delivery for one resolved recipient and destination.
create table if not exists public.notification_deliveries (
  id text primary key,
  notification_id text not null references public.notifications(id),
  channel text not null
    check (channel in ('email', 'sms', 'staff', 'portal', 'push', 'webhook')),
  recipient_type text not null,
  recipient_key text not null,
  recipient_snapshot jsonb not null default '{}'::jsonb,
  destination_key text not null,
  destination_snapshot jsonb not null default '{}'::jsonb,
  template_type text not null default '',
  template_version_id text not null default '',
  template_version integer,
  rendered_content jsonb not null default '{}'::jsonb,
  provider_key text not null default '',
  idempotency_key text not null,
  status text not null default 'queued'
    check (
      status in (
        'queued',
        'processing',
        'sent',
        'delivered',
        'failed',
        'retry_scheduled',
        'not_deliverable',
        'suppressed',
        'cancelled'
      )
    ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text not null default '',
  last_failure_code text not null default '',
  last_failure_reason text not null default '',
  queued_at timestamptz,
  processing_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  claim_token text not null default '',
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_deliveries_identity_unique
    unique (
      notification_id,
      channel,
      recipient_type,
      recipient_key,
      destination_key,
      template_version_id
    ),
  constraint notification_deliveries_idempotency_unique
    unique (idempotency_key),
  constraint notification_deliveries_template_version_valid
    check (template_version is null or template_version > 0)
);

create index if not exists notification_deliveries_dispatch_idx
  on public.notification_deliveries (status, next_retry_at, created_at)
  where status in ('queued', 'retry_scheduled');

create index if not exists notification_deliveries_claim_idx
  on public.notification_deliveries (claim_expires_at)
  where status = 'processing';

create index if not exists notification_deliveries_provider_message_idx
  on public.notification_deliveries (provider_key, provider_message_id)
  where provider_message_id <> '';

drop trigger if exists notification_deliveries_updated_at
  on public.notification_deliveries;
create trigger notification_deliveries_updated_at
  before update on public.notification_deliveries
  for each row execute procedure public.set_notification_engine_updated_at();

-- Immutable record of each adapter invocation for a logical Delivery.
create table if not exists public.notification_delivery_attempts (
  id text primary key,
  delivery_id text not null references public.notification_deliveries(id),
  attempt_number integer not null check (attempt_number > 0),
  provider_key text not null default '',
  provider_idempotency_key text not null,
  outcome text not null default 'processing'
    check (
      outcome in (
        'processing',
        'accepted',
        'sent',
        'delivered',
        'failed',
        'indeterminate'
      )
    ),
  retryability text not null default 'unknown'
    check (retryability in ('retryable', 'terminal', 'indeterminate', 'unknown')),
  provider_message_id text not null default '',
  failure_code text not null default '',
  failure_reason text not null default '',
  provider_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notification_delivery_attempts_number_unique
    unique (delivery_id, attempt_number),
  constraint notification_delivery_attempts_provider_key_unique
    unique (provider_idempotency_key)
);

create index if not exists notification_delivery_attempts_delivery_idx
  on public.notification_delivery_attempts (delivery_id, attempt_number desc);

create index if not exists notification_delivery_attempts_provider_message_idx
  on public.notification_delivery_attempts (provider_key, provider_message_id)
  where provider_message_id <> '';

-- Seed an immutable version 1 snapshot for every existing template row.
-- Existing rows remain the runtime source of truth during Phase 2A.
insert into public.notification_template_versions (
  id,
  template_type,
  version,
  name,
  email_subject,
  email_body,
  sms_message,
  status,
  published_at,
  published_by,
  created_at
)
select
  type || ':v1',
  type,
  1,
  name,
  email_subject,
  email_body,
  sms_message,
  'published',
  coalesce(updated_at, created_at, timezone('utc', now())),
  'phase2a_migration',
  coalesce(created_at, timezone('utc', now()))
from public.notification_templates
on conflict (template_type, version) do nothing;

-- Seed one automatic policy per existing template using the current channel
-- flags. These rows are dormant until Phase 2B begins policy evaluation.
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
select
  'policy:' || type || ':v1',
  type,
  1,
  true,
  'automatic',
  email_enabled,
  sms_enabled,
  staff_notification_enabled,
  true,
  staff_notification_enabled,
  false,
  jsonb_strip_nulls(
    jsonb_build_object(
      'email', case when email_subject <> '' or email_body <> '' then type || ':v1' end,
      'sms', case when sms_message <> '' then type || ':v1' end,
      'staff', case when staff_notification_enabled then type || ':v1' end
    )
  ),
  coalesce(updated_at, created_at, timezone('utc', now())),
  'phase2a_migration'
from public.notification_templates
on conflict (event_type, version) do nothing;

