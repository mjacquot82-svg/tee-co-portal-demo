alter table if exists public.customers
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists merged_into_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_customer_ids uuid[] not null default '{}';

create index if not exists customers_archived_idx on public.customers (archived);
create index if not exists customers_merged_into_idx on public.customers (merged_into_customer_id);
