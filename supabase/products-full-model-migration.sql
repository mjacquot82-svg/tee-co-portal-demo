create extension if not exists "pgcrypto";

create table if not exists public.storefront_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.products
add column if not exists storefront_category text;

alter table public.products
add column if not exists storefront_category_lookup_id uuid references public.storefront_categories(id) on delete set null;

alter table public.products
add column if not exists compare_at_price numeric(10, 2);

alter table public.products
add column if not exists characteristics jsonb not null default '[]'::jsonb;

alter table public.products
add column if not exists is_featured boolean not null default false;

alter table public.products
add column if not exists is_hero_feature boolean not null default false;
