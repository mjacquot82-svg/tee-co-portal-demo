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

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  external_reference text,
  name text not null,
  company text default '',
  email text default '',
  phone text default '',
  status text not null default 'active',
  customer_type text not null default 'business',
  notes text default '',
  tags text[] not null default '{}',
  last_order_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  legacy_staff_id text unique,
  name text not null,
  role text not null default 'Staff',
  pin text,
  status text not null default 'Active',
  last_active_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_product_id text unique,
  sku text,
  name text not null,
  category text default '',
  product_type text default '',
  brand_model text default '',
  status text not null default 'Active',
  image text default '',
  colors jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  placements jsonb not null default '[]'::jsonb,
  placement_config jsonb not null default '[]'::jsonb,
  placement_prices jsonb not null default '{}'::jsonb,
  production_methods jsonb not null default '[]'::jsonb,
  decoration_types jsonb not null default '[]'::jsonb,
  production_method_prices jsonb not null default '{}'::jsonb,
  cost_price numeric(10, 2) not null default 0,
  markup_percentage numeric(10, 2) not null default 0,
  base_garment_price numeric(10, 2),
  unit_price numeric(10, 2),
  notes text default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  legacy_order_number text unique,
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
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
  assigned_to_staff_user_id uuid references public.staff_users(id) on delete set null,
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
  created_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  updated_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  legacy_sale_number text unique,
  sale_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
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
  created_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  updated_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  entity_reference text default '',
  activity_type text not null,
  operational_status text default '',
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  staff_user_id uuid references public.staff_users(id) on delete set null,
  staff_name text default '',
  staff_role text default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customers_status_idx on public.customers (status);
create index if not exists staff_users_status_idx on public.staff_users (status);
create index if not exists products_status_idx on public.products (status);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_assigned_to_staff_user_id_idx
  on public.orders (assigned_to_staff_user_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists activity_logs_entity_type_entity_reference_idx
  on public.activity_logs (entity_type, entity_reference);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

drop trigger if exists set_staff_users_updated_at on public.staff_users;
create trigger set_staff_users_updated_at
before update on public.staff_users
for each row
execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at
before update on public.sales
for each row
execute function public.set_updated_at();

drop trigger if exists set_activity_logs_updated_at on public.activity_logs;
create trigger set_activity_logs_updated_at
before update on public.activity_logs
for each row
execute function public.set_updated_at();
