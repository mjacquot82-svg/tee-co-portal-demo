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
