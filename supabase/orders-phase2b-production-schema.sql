-- Phase 2B Orders production schema hardening.
-- Review and run manually before deploying Orders as a production-authoritative domain.
-- This migration is idempotent and backfills from quote.__tee_co_order_snapshot when present.

alter table public.orders
  add column if not exists quote_status text not null default 'Draft',
  add column if not exists quote_archived boolean not null default false,
  add column if not exists request_type text default '',
  add column if not exists customer_email text default '',
  add column if not exists customer_phone text default '',
  add column if not exists company text default '',
  add column if not exists artwork_approval_required boolean not null default false,
  add column if not exists artwork_approval_status text not null default 'Not Required',
  add column if not exists artwork_status text default '',
  add column if not exists approval_note text default '',
  add column if not exists customer_artwork_id text default '',
  add column if not exists customer_artwork_name text default '',
  add column if not exists artwork_reference_names jsonb not null default '[]'::jsonb,
  add column if not exists deposit_required boolean,
  add column if not exists deposit_workflow_status text not null default 'Deposit Not Required',
  add column if not exists deposit_requirement text default '',
  add column if not exists deposit_requirement_status text default '',
  add column if not exists deposit_details jsonb not null default '{}'::jsonb,
  add column if not exists subtotal numeric(10, 2) not null default 0,
  add column if not exists tax_amount numeric(10, 2) not null default 0,
  add column if not exists total_amount numeric(10, 2) not null default 0,
  add column if not exists total_paid numeric(10, 2) not null default 0,
  add column if not exists deposit_applied numeric(10, 2) not null default 0,
  add column if not exists deposit_outstanding numeric(10, 2) not null default 0,
  add column if not exists payment_collection_state text default '',
  add column if not exists invoice_status text default '',
  add column if not exists pickup_status text default '',
  add column if not exists payment_history jsonb not null default '[]'::jsonb,
  add column if not exists production_owner_staff_id text default '',
  add column if not exists production_owner_staff_name text default '',
  add column if not exists production_owner_staff_role text default '',
  add column if not exists production_owner_assigned_at timestamptz,
  add column if not exists workflow_state jsonb not null default '{}'::jsonb,
  add column if not exists workflow_overrides jsonb not null default '{}'::jsonb,
  add column if not exists is_rush boolean not null default false,
  add column if not exists decoration_type text default '',
  add column if not exists placement text default '',
  add column if not exists order_metadata jsonb not null default '{}'::jsonb;

create index if not exists orders_quote_status_idx
  on public.orders (quote_status);

create index if not exists orders_customer_email_idx
  on public.orders (lower(customer_email));

create index if not exists orders_payment_collection_state_idx
  on public.orders (payment_collection_state);

create index if not exists orders_invoice_status_idx
  on public.orders (invoice_status);

create index if not exists orders_pickup_status_idx
  on public.orders (pickup_status);

create index if not exists orders_production_owner_staff_id_idx
  on public.orders (production_owner_staff_id);

create index if not exists orders_artwork_approval_status_idx
  on public.orders (artwork_approval_status);

create index if not exists orders_deposit_workflow_status_idx
  on public.orders (deposit_workflow_status);

with snapshot_source as (
  select
    id,
    quote -> '__tee_co_order_snapshot' as snapshot
  from public.orders
  where jsonb_typeof(quote -> '__tee_co_order_snapshot') = 'object'
),
normalized_snapshot as (
  select
    id,
    snapshot,
    nullif(snapshot ->> 'quote_status', '') as quote_status,
    case lower(coalesce(snapshot ->> 'quote_archived', ''))
      when 'true' then true
      when 'false' then false
      else false
    end as quote_archived,
    nullif(snapshot ->> 'request_type', '') as request_type,
    nullif(snapshot ->> 'customer_email', '') as customer_email,
    nullif(snapshot ->> 'customer_phone', '') as customer_phone,
    nullif(snapshot ->> 'company', '') as company,
    case lower(coalesce(snapshot ->> 'artwork_approval_required', ''))
      when 'true' then true
      when 'false' then false
      else false
    end as artwork_approval_required,
    nullif(snapshot ->> 'artwork_approval_status', '') as artwork_approval_status,
    nullif(snapshot ->> 'artwork_status', '') as artwork_status,
    nullif(snapshot ->> 'approval_note', '') as approval_note,
    nullif(snapshot ->> 'customer_artwork_id', '') as customer_artwork_id,
    nullif(snapshot ->> 'customer_artwork_name', '') as customer_artwork_name,
    case
      when jsonb_typeof(snapshot -> 'artwork_reference_names') = 'array'
        then snapshot -> 'artwork_reference_names'
      else '[]'::jsonb
    end as artwork_reference_names,
    case
      when lower(coalesce(snapshot ->> 'deposit_required', '')) in ('true', 'false')
        then (snapshot ->> 'deposit_required')::boolean
      else null
    end as deposit_required,
    nullif(snapshot ->> 'deposit_workflow_status', '') as deposit_workflow_status,
    nullif(snapshot ->> 'deposit_requirement', '') as deposit_requirement,
    nullif(snapshot ->> 'deposit_requirement_status', '') as deposit_requirement_status,
    case
      when jsonb_typeof(snapshot -> 'deposit') = 'object'
        then snapshot -> 'deposit'
      else '{}'::jsonb
    end as deposit_details,
    case when (snapshot ->> 'subtotal') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'subtotal')::numeric else 0 end as subtotal,
    case when (snapshot ->> 'tax_amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'tax_amount')::numeric else 0 end as tax_amount,
    case when (snapshot ->> 'total_amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'total_amount')::numeric else 0 end as total_amount,
    case when (snapshot ->> 'total_paid') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'total_paid')::numeric else 0 end as total_paid,
    case when (snapshot ->> 'deposit_applied') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'deposit_applied')::numeric else 0 end as deposit_applied,
    case when (snapshot ->> 'deposit_outstanding') ~ '^-?[0-9]+(\.[0-9]+)?$' then (snapshot ->> 'deposit_outstanding')::numeric else 0 end as deposit_outstanding,
    nullif(snapshot ->> 'payment_collection_state', '') as payment_collection_state,
    nullif(snapshot ->> 'invoice_status', '') as invoice_status,
    nullif(snapshot ->> 'pickup_status', '') as pickup_status,
    case
      when jsonb_typeof(snapshot -> 'payment_history') = 'array'
        then snapshot -> 'payment_history'
      else '[]'::jsonb
    end as payment_history,
    nullif(snapshot ->> 'production_owner_staff_id', '') as production_owner_staff_id,
    nullif(snapshot ->> 'production_owner_staff_name', '') as production_owner_staff_name,
    nullif(snapshot ->> 'production_owner_staff_role', '') as production_owner_staff_role,
    case
      when (snapshot ->> 'production_owner_assigned_at') ~ '^\d{4}-\d{2}-\d{2}'
        then (snapshot ->> 'production_owner_assigned_at')::timestamptz
      else null
    end as production_owner_assigned_at,
    case
      when jsonb_typeof(snapshot -> 'workflow_state') = 'object'
        then snapshot -> 'workflow_state'
      else '{}'::jsonb
    end as workflow_state,
    case
      when jsonb_typeof(snapshot -> 'workflow_overrides') = 'object'
        then snapshot -> 'workflow_overrides'
      else '{}'::jsonb
    end as workflow_overrides,
    case lower(coalesce(snapshot ->> 'is_rush', ''))
      when 'true' then true
      when 'false' then false
      else false
    end as is_rush,
    nullif(snapshot ->> 'decoration_type', '') as decoration_type,
    nullif(snapshot ->> 'placement', '') as placement
  from snapshot_source
)
update public.orders as orders
set
  quote_status = coalesce(normalized_snapshot.quote_status, orders.quote_status),
  quote_archived = normalized_snapshot.quote_archived,
  request_type = coalesce(normalized_snapshot.request_type, orders.request_type),
  customer_email = coalesce(normalized_snapshot.customer_email, orders.customer_email),
  customer_phone = coalesce(normalized_snapshot.customer_phone, orders.customer_phone),
  company = coalesce(normalized_snapshot.company, orders.company),
  artwork_approval_required = normalized_snapshot.artwork_approval_required,
  artwork_approval_status = coalesce(normalized_snapshot.artwork_approval_status, orders.artwork_approval_status),
  artwork_status = coalesce(normalized_snapshot.artwork_status, orders.artwork_status),
  approval_note = coalesce(normalized_snapshot.approval_note, orders.approval_note),
  customer_artwork_id = coalesce(normalized_snapshot.customer_artwork_id, orders.customer_artwork_id),
  customer_artwork_name = coalesce(normalized_snapshot.customer_artwork_name, orders.customer_artwork_name),
  artwork_reference_names = normalized_snapshot.artwork_reference_names,
  deposit_required = coalesce(normalized_snapshot.deposit_required, orders.deposit_required),
  deposit_workflow_status = coalesce(normalized_snapshot.deposit_workflow_status, orders.deposit_workflow_status),
  deposit_requirement = coalesce(normalized_snapshot.deposit_requirement, orders.deposit_requirement),
  deposit_requirement_status = coalesce(normalized_snapshot.deposit_requirement_status, orders.deposit_requirement_status),
  deposit_details = normalized_snapshot.deposit_details,
  subtotal = normalized_snapshot.subtotal,
  tax_amount = normalized_snapshot.tax_amount,
  total_amount = normalized_snapshot.total_amount,
  total_paid = normalized_snapshot.total_paid,
  deposit_applied = normalized_snapshot.deposit_applied,
  deposit_outstanding = normalized_snapshot.deposit_outstanding,
  payment_collection_state = coalesce(normalized_snapshot.payment_collection_state, orders.payment_collection_state),
  invoice_status = coalesce(normalized_snapshot.invoice_status, orders.invoice_status),
  pickup_status = coalesce(normalized_snapshot.pickup_status, orders.pickup_status),
  payment_history = normalized_snapshot.payment_history,
  production_owner_staff_id = coalesce(normalized_snapshot.production_owner_staff_id, orders.production_owner_staff_id),
  production_owner_staff_name = coalesce(normalized_snapshot.production_owner_staff_name, orders.production_owner_staff_name),
  production_owner_staff_role = coalesce(normalized_snapshot.production_owner_staff_role, orders.production_owner_staff_role),
  production_owner_assigned_at = coalesce(normalized_snapshot.production_owner_assigned_at, orders.production_owner_assigned_at),
  workflow_state = normalized_snapshot.workflow_state,
  workflow_overrides = normalized_snapshot.workflow_overrides,
  is_rush = normalized_snapshot.is_rush,
  decoration_type = coalesce(normalized_snapshot.decoration_type, orders.decoration_type),
  placement = coalesce(normalized_snapshot.placement, orders.placement),
  order_metadata = orders.order_metadata || jsonb_build_object(
    'phase2b_backfilled_from_snapshot', true,
    'phase2b_backfilled_at', timezone('utc', now())
  )
from normalized_snapshot
where orders.id = normalized_snapshot.id;
