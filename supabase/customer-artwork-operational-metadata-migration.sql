alter table if exists public.customer_artwork
  add column if not exists display_name text,
  add column if not exists original_filename text,
  add column if not exists file_type text,
  add column if not exists file_size bigint not null default 0,
  add column if not exists placement_hint text,
  add column if not exists notes text,
  add column if not exists linked_order_ids text[] not null default '{}',
  add column if not exists linked_quote_ids text[] not null default '{}',
  add column if not exists artwork_type text not null default '',
  add column if not exists artwork_status text not null default 'Library',
  add column if not exists last_used_at timestamptz,
  add column if not exists legacy_local_artwork_id text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists customer_artwork_legacy_local_artwork_id_idx
  on public.customer_artwork (legacy_local_artwork_id)
  where legacy_local_artwork_id is not null;

update public.customer_artwork
set
  display_name = coalesce(nullif(display_name, ''), file_name),
  original_filename = coalesce(nullif(original_filename, ''), file_name),
  artwork_status = coalesce(nullif(artwork_status, ''), 'Library'),
  artwork_type = coalesce(artwork_type, ''),
  linked_order_ids = coalesce(linked_order_ids, '{}'),
  linked_quote_ids = coalesce(linked_quote_ids, '{}'),
  updated_at = coalesce(updated_at, uploaded_at, timezone('utc', now()));
