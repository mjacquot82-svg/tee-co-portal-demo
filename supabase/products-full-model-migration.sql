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
  notes text default '',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.products
  add column if not exists legacy_product_id text,
  add column if not exists sku text,
  add column if not exists product_type text default '',
  add column if not exists brand_model text default '',
  add column if not exists category_lookup_id uuid references public.categories(id) on delete set null,
  add column if not exists brand_lookup_id uuid references public.brands(id) on delete set null,
  add column if not exists garment_model_lookup_id uuid references public.garment_models(id) on delete set null,
  add column if not exists status text not null default 'Active',
  add column if not exists image text default '',
  add column if not exists colors jsonb not null default '[]'::jsonb,
  add column if not exists sizes jsonb not null default '[]'::jsonb,
  add column if not exists placements jsonb not null default '[]'::jsonb,
  add column if not exists placement_config jsonb not null default '[]'::jsonb,
  add column if not exists placement_prices jsonb not null default '{}'::jsonb,
  add column if not exists production_methods jsonb not null default '[]'::jsonb,
  add column if not exists decoration_types jsonb not null default '[]'::jsonb,
  add column if not exists production_method_prices jsonb not null default '{}'::jsonb,
  add column if not exists cost_price numeric(10, 2) not null default 0,
  add column if not exists markup_percentage numeric(10, 2) not null default 0,
  add column if not exists base_garment_price numeric(10, 2),
  add column if not exists unit_price numeric(10, 2),
  add column if not exists notes text default '',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_legacy_product_id_key'
  ) then
    alter table public.products
      add constraint products_legacy_product_id_key unique (legacy_product_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'active'
  ) then
    execute $sql$
      update public.products
      set status = case
        when coalesce(active, true) then 'Active'
        else 'Inactive'
      end
      where status is null or btrim(status) = ''
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  ) then
    execute $sql$
      update public.products
      set unit_price = coalesce(unit_price, price),
          base_garment_price = coalesce(base_garment_price, unit_price, price)
      where price is not null
    $sql$;
  end if;
end
$$;

update public.products
set product_type = coalesce(nullif(product_type, ''), name),
    colors = coalesce(colors, '[]'::jsonb),
    sizes = coalesce(sizes, '[]'::jsonb),
    placements = coalesce(placements, '[]'::jsonb),
    placement_config = coalesce(placement_config, '[]'::jsonb),
    placement_prices = coalesce(placement_prices, '{}'::jsonb),
    production_methods = coalesce(production_methods, '[]'::jsonb),
    decoration_types = case
      when decoration_types is null or decoration_types = 'null'::jsonb
        then coalesce(production_methods, '[]'::jsonb)
      else decoration_types
    end,
    production_method_prices = coalesce(production_method_prices, '{}'::jsonb),
    notes = coalesce(notes, '');

create index if not exists categories_active_idx on public.categories (active);
create index if not exists brands_active_idx on public.brands (active);
create index if not exists colors_active_idx on public.colors (active);
create index if not exists sizes_sort_order_idx on public.sizes (sort_order);
create index if not exists garment_models_brand_id_idx on public.garment_models (brand_id);
create index if not exists garment_models_category_id_idx on public.garment_models (category_id);
create index if not exists garment_library_items_active_idx on public.garment_library_items (active);
create index if not exists garment_library_items_model_idx
  on public.garment_library_items (garment_model_lookup_id);
create index if not exists products_category_lookup_id_idx on public.products (category_lookup_id);
create index if not exists products_brand_lookup_id_idx on public.products (brand_lookup_id);
create index if not exists products_garment_model_lookup_id_idx
  on public.products (garment_model_lookup_id);

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

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();
