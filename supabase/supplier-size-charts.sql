-- S&S size charts (measurements per size) per garment style.
-- Additive only: one new table, nothing existing is changed. Safe to run more than once.
-- STAGING FIRST. Do not run on live until Marc approves.
-- Filled by scripts/import-ss-products.mjs from the S&S Data Library "Specs" sheet (or V2 /specs API).
-- Rollback: supabase/supplier-size-charts-rollback.sql

begin;

create table if not exists public.supplier_size_charts (
  id uuid primary key default gen_random_uuid(),
  supplier text not null default 'ss_activewear',
  brand_name text not null,
  style_name text not null,
  style_key text not null,            -- same key as supplier_color_images.style_key
  style_id integer,
  unit text not null default 'in',
  sizes jsonb not null default '[]'::jsonb,         -- ["S","M","L",...] in S&S order
  measurements jsonb not null default '[]'::jsonb,  -- [{"name":"Body Length","values":{"S":"28",...}}]
  source text not null default 'ss_product_file',
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_size_charts_unique unique (supplier, style_key)
);

alter table public.supplier_size_charts enable row level security;

drop policy if exists supplier_size_charts_public_read on public.supplier_size_charts;
create policy supplier_size_charts_public_read on public.supplier_size_charts
  for select to anon, authenticated
  using (active);

drop policy if exists supplier_size_charts_staff_write on public.supplier_size_charts;
create policy supplier_size_charts_staff_write on public.supplier_size_charts
  for all to authenticated
  using (public.is_tee_co_operational_staff())
  with check (public.is_tee_co_operational_staff());

revoke all on public.supplier_size_charts from anon, authenticated;
grant select on public.supplier_size_charts to anon, authenticated;
grant insert, update, delete on public.supplier_size_charts to authenticated;
grant all on public.supplier_size_charts to service_role;

commit;
