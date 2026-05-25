alter table public.products
add column if not exists characteristics jsonb not null default '[]'::jsonb;
