-- Customer Auth Linking
-- Run this in the Supabase SQL editor after the phase1 schema.
-- Purpose: make customer portal accounts durable by linking public.customers rows
-- to Supabase Auth users through auth.users.id.

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists customers_auth_user_id_idx
  on public.customers (auth_user_id);

create unique index if not exists customers_auth_user_id_unique_idx
  on public.customers (auth_user_id)
  where auth_user_id is not null;

-- Keep existing email matching usable for older/customer-created records.
create index if not exists customers_lower_email_idx
  on public.customers (lower(email));

-- Optional helper for backfilling a customer row after a user signs up with an email
-- that already exists in the customers table. This is intentionally conservative:
-- it only links unlinked customers and does not overwrite an existing auth_user_id.
create or replace function public.link_customer_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers
  set
    auth_user_id = new.id,
    external_reference = coalesce(nullif(external_reference, ''), new.id::text),
    updated_at = timezone('utc', now())
  where auth_user_id is null
    and lower(email) = lower(new.email)
    and new.email is not null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_customer_profile on auth.users;

create trigger on_auth_user_created_link_customer_profile
after insert on auth.users
for each row execute function public.link_customer_profile_for_auth_user();

-- RLS prep. Do not enable these until the app has been smoke-tested with Auth.
-- alter table public.customers enable row level security;
--
-- create policy "Customers can read their own profile"
--   on public.customers
--   for select
--   using (auth.uid() = auth_user_id);
--
-- create policy "Customers can update their own profile"
--   on public.customers
--   for update
--   using (auth.uid() = auth_user_id)
--   with check (auth.uid() = auth_user_id);
