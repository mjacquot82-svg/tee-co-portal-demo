-- S&S colour photos (front / back / side / on-model) per garment colour.
-- Additive only: one new table, nothing existing is changed. Safe to run more than once.
-- STAGING FIRST. Do not run on live until Marc approves.
-- Filled by scripts/import-ss-products.mjs (S&S product file or V2 API).
-- Rollback: supabase/supplier-color-images-rollback.sql

begin;

create table if not exists public.supplier_color_images (
  id uuid primary key default gen_random_uuid(),
  supplier text not null default 'ss_activewear',
  brand_name text not null,
  style_name text not null,
  style_key text not null,            -- lower(brand)|lower(style), e.g. 'gildan|5000'
  style_id integer,                   -- S&S styleID
  color_name text not null,
  color_key text not null,            -- lower(colour name), used to match the colour picker
  color_code text,
  color_style_id integer,             -- S&S colour id (the number in the image file names)
  color_hex text,
  color_swatch_image text,            -- S&S image paths, e.g. 'Images/Color/16813_f_fm.jpg'
  color_front_image text,
  color_back_image text,
  color_side_image text,
  color_direct_side_image text,
  color_on_model_front_image text,
  color_on_model_back_image text,
  color_on_model_side_image text,
  source text not null default 'ss_product_file',
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_color_images_unique unique (supplier, style_key, color_key)
);

create index if not exists supplier_color_images_style_key_idx
  on public.supplier_color_images (style_key) where active;

alter table public.supplier_color_images enable row level security;

drop policy if exists supplier_color_images_public_read on public.supplier_color_images;
create policy supplier_color_images_public_read on public.supplier_color_images
  for select to anon, authenticated
  using (active);

-- Staff can correct rows from the app later; the importer uses the service role (bypasses RLS).
drop policy if exists supplier_color_images_staff_write on public.supplier_color_images;
create policy supplier_color_images_staff_write on public.supplier_color_images
  for all to authenticated
  using (public.is_tee_co_operational_staff())
  with check (public.is_tee_co_operational_staff());

revoke all on public.supplier_color_images from anon, authenticated;
grant select on public.supplier_color_images to anon, authenticated;
grant insert, update, delete on public.supplier_color_images to authenticated;
grant all on public.supplier_color_images to service_role;

commit;
