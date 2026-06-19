create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

alter table public.products
add column if not exists image_storage_path text;

alter table public.products
add column if not exists image_content_type text;

alter table public.products
add column if not exists image_file_size bigint;

alter table public.products
add column if not exists image_updated_at timestamptz;

alter table public.products
add column if not exists image_thumb_storage_path text;

create table if not exists public.product_image_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  staff_user_id text,
  ip_key text,
  success boolean not null default false,
  failure_reason text not null default '',
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists product_image_upload_attempts_staff_idx
  on public.product_image_upload_attempts (staff_user_id, attempted_at desc)
  where success = false;

create index if not exists product_image_upload_attempts_ip_idx
  on public.product_image_upload_attempts (ip_key, attempted_at desc)
  where success = false;

alter table public.product_image_upload_attempts enable row level security;

drop policy if exists "Anyone can view product image objects" on storage.objects;
create policy "Anyone can view product image objects"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

drop policy if exists "Operational staff can upload product image objects" on storage.objects;
create policy "Operational staff can upload product image objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_tee_co_operational_staff()
);

drop policy if exists "Operational staff can update product image objects" on storage.objects;
create policy "Operational staff can update product image objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_tee_co_operational_staff()
)
with check (
  bucket_id = 'product-images'
  and public.is_tee_co_operational_staff()
);

drop policy if exists "Operational staff can delete product image objects" on storage.objects;
create policy "Operational staff can delete product image objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_tee_co_operational_staff()
);
