create extension if not exists pgcrypto;

create or replace function public.is_tee_co_operational_staff()
returns boolean
language sql
stable
as $$
  select lower(
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'operational_role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'operational_role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    )
  ) = any (array['owner', 'manager', 'staff']);
$$;

create table if not exists public.customer_artwork (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  uploaded_at timestamptz not null default timezone('utc', now()),
  uploaded_by text
);

create index if not exists customer_artwork_customer_id_idx
  on public.customer_artwork (customer_id, uploaded_at desc);

alter table public.customer_artwork enable row level security;

drop policy if exists "Operational staff can view customer artwork metadata" on public.customer_artwork;
create policy "Operational staff can view customer artwork metadata"
on public.customer_artwork
for select
to authenticated
using (public.is_tee_co_operational_staff());

drop policy if exists "Operational staff can insert customer artwork metadata" on public.customer_artwork;
create policy "Operational staff can insert customer artwork metadata"
on public.customer_artwork
for insert
to authenticated
with check (public.is_tee_co_operational_staff());

insert into storage.buckets (id, name, public)
values ('customer-artwork', 'customer-artwork', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "Operational staff can view customer artwork objects" on storage.objects;
create policy "Operational staff can view customer artwork objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-artwork'
  and public.is_tee_co_operational_staff()
);

drop policy if exists "Operational staff can upload customer artwork objects" on storage.objects;
create policy "Operational staff can upload customer artwork objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-artwork'
  and public.is_tee_co_operational_staff()
);

drop policy if exists "Operational staff can delete customer artwork objects" on storage.objects;
create policy "Operational staff can delete customer artwork objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-artwork'
  and public.is_tee_co_operational_staff()
);
