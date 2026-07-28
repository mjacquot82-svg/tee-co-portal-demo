-- Customer Artwork: customer-owned access
--
-- Operational artwork policies remain unchanged. These additional policies allow
-- an authenticated customer to read and create metadata for their own linked
-- customer profile and to read/upload objects only inside that profile's folder.

-- Link existing unambiguous customer/Auth pairs. Ambiguous or duplicate emails
-- are intentionally left unchanged for manual resolution.
with customer_email_counts as (
  select lower(email) as normalized_email, count(*) as customer_count
  from public.customers
  where nullif(trim(email), '') is not null
  group by lower(email)
),
auth_email_counts as (
  select lower(email) as normalized_email, count(*) as auth_user_count
  from auth.users
  where nullif(trim(email), '') is not null
  group by lower(email)
),
unambiguous_matches as (
  select customer.id as customer_id, auth_user.id::text as auth_user_id
  from public.customers as customer
  join auth.users as auth_user
    on lower(auth_user.email) = lower(customer.email)
  join customer_email_counts
    on customer_email_counts.normalized_email = lower(customer.email)
   and customer_email_counts.customer_count = 1
  join auth_email_counts
    on auth_email_counts.normalized_email = lower(auth_user.email)
   and auth_email_counts.auth_user_count = 1
  where customer.auth_user_id is null
)
update public.customers as customer
set auth_user_id = unambiguous_matches.auth_user_id
from unambiguous_matches
where customer.id = unambiguous_matches.customer_id;

create or replace function public.is_customer_artwork_owner(target_customer_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers
    where customers.id::text = target_customer_id
      and customers.auth_user_id = auth.uid()::text
  );
$$;

revoke all on function public.is_customer_artwork_owner(text) from public;
grant execute on function public.is_customer_artwork_owner(text) to authenticated;

alter table public.customer_artwork enable row level security;

drop policy if exists "Customers can view their own artwork metadata"
  on public.customer_artwork;
create policy "Customers can view their own artwork metadata"
on public.customer_artwork
for select
to authenticated
using (
  public.is_customer_artwork_owner(customer_id::text)
);

drop policy if exists "Customers can create their own artwork metadata"
  on public.customer_artwork;
create policy "Customers can create their own artwork metadata"
on public.customer_artwork
for insert
to authenticated
with check (
  public.is_customer_artwork_owner(customer_id::text)
  and public.is_customer_artwork_owner(
    (storage.foldername(storage_path))[1]
  )
  and (storage.foldername(storage_path))[1] = customer_id::text
);

drop policy if exists "Customers can view their own artwork objects"
  on storage.objects;
create policy "Customers can view their own artwork objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-artwork'
  and public.is_customer_artwork_owner((storage.foldername(name))[1])
);

drop policy if exists "Customers can upload their own artwork objects"
  on storage.objects;
create policy "Customers can upload their own artwork objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-artwork'
  and public.is_customer_artwork_owner((storage.foldername(name))[1])
);
