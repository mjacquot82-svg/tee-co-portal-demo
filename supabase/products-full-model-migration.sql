alter table public.products
  add column if not exists legacy_product_id text,
  add column if not exists sku text,
  add column if not exists product_type text default '',
  add column if not exists brand_model text default '',
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
