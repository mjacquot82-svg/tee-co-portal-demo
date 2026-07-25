create extension if not exists "pgcrypto";

create table if not exists public.garment_model_colors (
  id uuid primary key default gen_random_uuid(),
  garment_model_id uuid not null references public.garment_models(id) on delete cascade,
  color_name text not null,
  display_order integer not null default 999,
  hex_value text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (garment_model_id, color_name)
);

create index if not exists garment_model_colors_model_idx
  on public.garment_model_colors (garment_model_id);

create index if not exists garment_model_colors_active_order_idx
  on public.garment_model_colors (garment_model_id, active, display_order);

drop trigger if exists set_garment_model_colors_updated_at on public.garment_model_colors;
create trigger set_garment_model_colors_updated_at
before update on public.garment_model_colors
for each row execute function public.set_updated_at();
