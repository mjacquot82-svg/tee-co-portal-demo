create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$
declare
  customer_id_type text;
  staff_user_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into customer_id_type
  from pg_attribute attribute
  where attribute.attrelid = to_regclass('public.customers')
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  select format_type(attribute.atttypid, attribute.atttypmod)
    into staff_user_id_type
  from pg_attribute attribute
  where attribute.attrelid = to_regclass('public.staff_users')
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if customer_id_type is null then
    raise exception 'public.customers.id is required before running payments-prerequisites-production.sql';
  end if;

  if staff_user_id_type is null then
    raise exception 'public.staff_users.id is required before running payments-prerequisites-production.sql';
  end if;

  execute format($sql$
    create table if not exists public.orders (
      id uuid primary key default gen_random_uuid(),
      legacy_order_number text unique,
      order_number text not null unique,
      customer_id %1$s references public.customers(id) on delete set null,
      customer_name text not null default '',
      status text not null default 'New',
      approval_status text not null default 'Not Sent',
      source text not null default 'Staff Entry',
      garment text default '',
      qty integer not null default 0,
      due_date date,
      order_date date,
      operational_visible boolean not null default true,
      production_ready boolean not null default false,
      needs_assignment boolean not null default true,
      assigned_to_staff_user_id %2$s references public.staff_users(id) on delete set null,
      assigned_to_staff_name text default '',
      assigned_to_staff_role text default '',
      assigned_at timestamptz,
      placements jsonb not null default '[]'::jsonb,
      artwork_files jsonb not null default '[]'::jsonb,
      quote jsonb,
      size_breakdown jsonb,
      line_items jsonb not null default '[]'::jsonb,
      deposit_status text not null default 'not_requested',
      deposit_amount numeric(10, 2) not null default 0,
      deposit_paid_amount numeric(10, 2) not null default 0,
      deposit_paid_at timestamptz,
      balance_due numeric(10, 2) not null default 0,
      payment_status text not null default 'unpaid',
      payment_method text default '',
      payment_reference text default '',
      notes text default '',
      internal_notes text default '',
      activity_log jsonb not null default '[]'::jsonb,
      created_by_staff_user_id %2$s references public.staff_users(id) on delete set null,
      updated_by_staff_user_id %2$s references public.staff_users(id) on delete set null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    )
  $sql$, customer_id_type, staff_user_id_type);

  execute format($sql$
    create table if not exists public.sales (
      id uuid primary key default gen_random_uuid(),
      legacy_sale_number text unique,
      sale_number text not null unique,
      customer_id %1$s references public.customers(id) on delete set null,
      customer_name text not null default '',
      status text not null default 'completed',
      payment_status text not null default 'Paid',
      payment_method text default '',
      payment_reference text default '',
      subtotal numeric(10, 2) not null default 0,
      discount_amount numeric(10, 2) not null default 0,
      tax_rate numeric(10, 4) not null default 0,
      tax_total numeric(10, 2) not null default 0,
      total numeric(10, 2) not null default 0,
      amount_paid numeric(10, 2) not null default 0,
      balance_due numeric(10, 2) not null default 0,
      deposit_amount numeric(10, 2) not null default 0,
      items jsonb not null default '[]'::jsonb,
      production_order_numbers jsonb not null default '[]'::jsonb,
      notes text default '',
      created_by_staff_user_id %2$s references public.staff_users(id) on delete set null,
      updated_by_staff_user_id %2$s references public.staff_users(id) on delete set null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    )
  $sql$, customer_id_type, staff_user_id_type);

  execute format($sql$
    create table if not exists public.activity_logs (
      id uuid primary key default gen_random_uuid(),
      entity_type text not null,
      entity_id uuid,
      entity_reference text default '',
      activity_type text not null,
      operational_status text default '',
      note text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      staff_user_id %1$s references public.staff_users(id) on delete set null,
      staff_name text default '',
      staff_role text default '',
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    )
  $sql$, staff_user_id_type);
end
$$;

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_assigned_to_staff_user_id_idx
  on public.orders (assigned_to_staff_user_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists activity_logs_entity_type_entity_reference_idx
  on public.activity_logs (entity_type, entity_reference);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_orders_updated_at'
      and tgrelid = 'public.orders'::regclass
  ) then
    create trigger set_orders_updated_at
    before update on public.orders
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_sales_updated_at'
      and tgrelid = 'public.sales'::regclass
  ) then
    create trigger set_sales_updated_at
    before update on public.sales
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_activity_logs_updated_at'
      and tgrelid = 'public.activity_logs'::regclass
  ) then
    create trigger set_activity_logs_updated_at
    before update on public.activity_logs
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;
