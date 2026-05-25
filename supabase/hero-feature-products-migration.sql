alter table public.products
add column if not exists is_hero_feature boolean not null default false;
