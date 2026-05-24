alter table if exists public.garment_library_items
  add column if not exists linked_storefront_product_ids jsonb not null default '[]'::jsonb;
