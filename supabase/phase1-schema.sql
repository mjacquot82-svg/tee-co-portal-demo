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

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hex_code text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 999,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.garment_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  model_code text default '',
  display_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_product_id text unique,
  sku text,
  name text not null,
  category text default '',
  category_lookup_id uuid references public.categories(id) on delete set null,
  product_type text default '',
  brand_model text default '',
  brand_lookup_id uuid references public.brands(id) on delete set null,
  garment_library_item_id uuid references public.garment_library_items(id) on delete set null,
  garment_model_lookup_id uuid references public.garment_models(id) on delete set null,
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

create table if not exists public.garment_library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_lookup_id uuid references public.categories(id) on delete set null,
  brand_lookup_id uuid references public.brands(id) on delete set null,
  garment_model_lookup_id uuid references public.garment_models(id) on delete set null,
  image text default '',
  variants jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  default_placements jsonb not null default '[]'::jsonb,
  default_production_methods jsonb not null default '[]'::jsonb,
  linked_storefront_product_ids jsonb not null default '[]'::jsonb,
  notes text default '',
  active boolean not null default true,
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
create index if not exists categories_active_idx on public.categories (active);
create index if not exists brands_active_idx on public.brands (active);
create index if not exists colors_active_idx on public.colors (active);
create index if not exists sizes_sort_order_idx on public.sizes (sort_order);
create index if not exists garment_models_brand_id_idx on public.garment_models (brand_id);
create index if not exists garment_models_category_id_idx on public.garment_models (category_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_category_lookup_id_idx on public.products (category_lookup_id);
create index if not exists products_brand_lookup_id_idx on public.products (brand_lookup_id);
create index if not exists products_garment_library_item_id_idx
  on public.products (garment_library_item_id);
create index if not exists products_garment_model_lookup_id_idx
  on public.products (garment_model_lookup_id);
create index if not exists garment_library_items_active_idx on public.garment_library_items (active);
create index if not exists garment_library_items_model_idx
  on public.garment_library_items (garment_model_lookup_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_assigned_to_staff_user_id_idx
  on public.orders (assigned_to_staff_user_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists activity_logs_entity_type_entity_reference_idx
  on public.activity_logs (entity_type, entity_reference);

insert into public.categories (name)
values
  ('T-Shirts'),
  ('Hoodies'),
  ('Hats'),
  ('Workwear'),
  ('Teamwear')
on conflict (name) do nothing;

insert into public.brands (name)
values
  ('Bella + Canvas'),
  ('Gildan'),
  ('Independent Trading Co.'),
  ('Port Authority'),
  ('Port & Company'),
  ('Richardson'),
  ('Sport-Tek')
on conflict (name) do nothing;

insert into public.colors (name, hex_code)
values
  ('Athletic Heather', '#b8bec6'),
  ('Black', '#111111'),
  ('Cardinal', '#8c1d2c'),
  ('Charcoal', '#4b5563'),
  ('Forest', '#1f5134'),
  ('Gold', '#d4a017'),
  ('Heather Gray', '#9ca3af'),
  ('Kelly', '#1f8f4e'),
  ('Maroon', '#6b1f2e'),
  ('Navy', '#142c52'),
  ('Orange', '#f97316'),
  ('Purple', '#6d28d9'),
  ('Red', '#c62828'),
  ('Royal', '#2563eb'),
  ('Sand', '#d6c5a4'),
  ('White', '#f8fafc')
on conflict (name) do nothing;

insert into public.sizes (name, sort_order)
values
  ('XS', 10),
  ('S', 20),
  ('M', 30),
  ('L', 40),
  ('XL', 50),
  ('2XL', 60),
  ('3XL', 70),
  ('4XL', 80),
  ('5XL', 90),
  ('One Size', 100)
on conflict (name) do update
set sort_order = excluded.sort_order;

do $$
declare
  bella_canvas_id uuid;
  gildan_id uuid;
  independent_id uuid;
  port_company_id uuid;
  port_authority_id uuid;
  richardson_id uuid;
  sport_tek_id uuid;
  tshirts_id uuid;
  hoodies_id uuid;
  hats_id uuid;
  teamwear_id uuid;
begin
  select id into bella_canvas_id from public.brands where name = 'Bella + Canvas';
  select id into gildan_id from public.brands where name = 'Gildan';
  select id into independent_id from public.brands where name = 'Independent Trading Co.';
  select id into port_company_id from public.brands where name = 'Port & Company';
  select id into port_authority_id from public.brands where name = 'Port Authority';
  select id into richardson_id from public.brands where name = 'Richardson';
  select id into sport_tek_id from public.brands where name = 'Sport-Tek';

  select id into tshirts_id from public.categories where name = 'T-Shirts';
  select id into hoodies_id from public.categories where name = 'Hoodies';
  select id into hats_id from public.categories where name = 'Hats';
  select id into teamwear_id from public.categories where name = 'Teamwear';

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select bella_canvas_id, '3001', 'Unisex Jersey Tee', tshirts_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = bella_canvas_id and model_code = '3001' and display_name = 'Unisex Jersey Tee'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select gildan_id, '64000', 'Softstyle Tee', tshirts_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = gildan_id and model_code = '64000' and display_name = 'Softstyle Tee'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select independent_id, 'IND4000', 'Heavyweight Hooded Sweatshirt', hoodies_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = independent_id and model_code = 'IND4000' and display_name = 'Heavyweight Hooded Sweatshirt'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select port_company_id, 'PC78H', 'Core Fleece Pullover Hoodie', hoodies_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = port_company_id and model_code = 'PC78H' and display_name = 'Core Fleece Pullover Hoodie'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select port_authority_id, 'PT45', 'Value Knit Beanie', hats_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = port_authority_id and model_code = 'PT45' and display_name = 'Value Knit Beanie'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select richardson_id, '112', 'Trucker Snapback', hats_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = richardson_id and model_code = '112' and display_name = 'Trucker Snapback'
  );

  insert into public.garment_models (brand_id, model_code, display_name, category_id)
  select sport_tek_id, 'J763H', 'Colorblock Hooded Raglan Jacket', teamwear_id
  where not exists (
    select 1 from public.garment_models
    where brand_id = sport_tek_id and model_code = 'J763H' and display_name = 'Colorblock Hooded Raglan Jacket'
  );
end
$$;

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
