-- ===========================================================================================
--  PROPOSED - NOT RUN.  Nobody has run this on staging or live. Do not run without Marc's OK.
-- ===========================================================================================
-- Merges duplicate customer profiles into one "keeper" profile each.
--
-- How it is meant to be used:
--   1. Run customer-duplicates-report.sql (read-only) and decide each pair with Marc.
--   2. Fill in the merge_pairs list below: (keep_id, duplicate_id). Nothing is picked automatically.
--   3. Run on STAGING first. The script ends with ROLLBACK, so a first run only shows what would
--      change. Only when the preview looks right, change the last line to COMMIT.
--
-- What it does for each pair:
--   - Saves a full copy of the duplicate profile and the ids it moves in
--     tee_co_private.customer_merge_backup (so it can be undone by hand).
--   - Moves orders, artwork, payment requests, payments, sales and terminal attempts
--     from the duplicate to the keeper.
--   - Fills the keeper's blank fields (name - also when it is the automatic "Customer Account" -, company, email, phone, login link, reference) from the
--     duplicate, appends the duplicate's notes, and combines order_numbers.
--   - Deletes the duplicate profile (after everything was moved, so nothing cascades away).
-- What it does not touch: past notification delivery records (they keep the old id as history).
-- Live's customers table has no archived/merged columns, which is why the duplicate is deleted
-- (with a backup) rather than flagged.

begin;

create schema if not exists tee_co_private;
create table if not exists tee_co_private.customer_merge_backup (
  id bigserial primary key,
  merged_at timestamptz not null default now(),
  keep_id text not null,
  duplicate_id text not null,
  duplicate_row jsonb not null,
  keeper_row_before jsonb not null,
  moved jsonb not null
);
revoke all on schema tee_co_private from public, anon, authenticated;
revoke all on tee_co_private.customer_merge_backup from public, anon, authenticated;

create temporary table merge_pairs (keep_id text, duplicate_id text unique) on commit drop;

insert into merge_pairs (keep_id, duplicate_id) values
  -- ('KEEP-CUSTOMER-ID', 'DUPLICATE-CUSTOMER-ID'),
  (null, null)   -- placeholder: remove this line after filling in real pairs
;
delete from merge_pairs where keep_id is null or duplicate_id is null;

do $$
declare
  bad int;
begin
  select count(*) into bad from merge_pairs p
  where p.keep_id = p.duplicate_id
     or not exists (select 1 from public.customers c where c.id = p.keep_id)
     or not exists (select 1 from public.customers c where c.id = p.duplicate_id)
     or p.keep_id in (select duplicate_id from merge_pairs);
  if bad > 0 then
    raise exception 'merge_pairs has % invalid row(s): missing ids, self-merge or a keeper that is also a duplicate', bad;
  end if;
  if (select count(*) from merge_pairs) = 0 then
    raise notice 'merge_pairs is empty: nothing to do';
  end if;
end $$;

-- 1. backup
insert into tee_co_private.customer_merge_backup (keep_id, duplicate_id, duplicate_row, keeper_row_before, moved)
select p.keep_id, p.duplicate_id, to_jsonb(d), to_jsonb(k), jsonb_build_object(
  'orders', (select coalesce(jsonb_agg(o.id), '[]') from public.orders o where o.customer_id = p.duplicate_id),
  'customer_artwork', (select coalesce(jsonb_agg(a.id), '[]') from public.customer_artwork a where a.customer_id = p.duplicate_id),
  'payment_requests', (select coalesce(jsonb_agg(r.id), '[]') from public.payment_requests r where r.customer_id = p.duplicate_id),
  'payments', (select coalesce(jsonb_agg(x.id), '[]') from public.payments x where x.customer_id = p.duplicate_id),
  'sales', (select coalesce(jsonb_agg(s.id), '[]') from public.sales s where s.customer_id = p.duplicate_id),
  'square_terminal_checkout_attempts', (select coalesce(jsonb_agg(t.id), '[]') from public.square_terminal_checkout_attempts t where t.customer_id = p.duplicate_id)
)
from merge_pairs p
join public.customers d on d.id = p.duplicate_id
join public.customers k on k.id = p.keep_id;

-- 2. move everything attached to the duplicate
update public.orders o set customer_id = p.keep_id from merge_pairs p where o.customer_id = p.duplicate_id;
update public.customer_artwork a set customer_id = p.keep_id from merge_pairs p where a.customer_id = p.duplicate_id;
update public.payment_requests r set customer_id = p.keep_id from merge_pairs p where r.customer_id = p.duplicate_id;
update public.payments x set customer_id = p.keep_id from merge_pairs p where x.customer_id = p.duplicate_id;
update public.sales s set customer_id = p.keep_id from merge_pairs p where s.customer_id = p.duplicate_id;
update public.square_terminal_checkout_attempts t set customer_id = p.keep_id from merge_pairs p where t.customer_id = p.duplicate_id;

-- 3. fill the keeper's blanks from the duplicate
update public.customers k set
  name = case when lower(coalesce(btrim(k.name), '')) in ('', 'customer account') and coalesce(btrim(d.name), '') <> ''
              then d.name else k.name end,
  company = coalesce(nullif(btrim(k.company), ''), d.company),
  email = coalesce(nullif(btrim(k.email), ''), d.email),
  phone = coalesce(nullif(btrim(k.phone), ''), d.phone),
  auth_user_id = coalesce(nullif(btrim(k.auth_user_id), ''), nullif(btrim(d.auth_user_id), '')),
  external_reference = coalesce(nullif(btrim(k.external_reference), ''), d.external_reference),
  notes = case
    when coalesce(btrim(d.notes), '') = '' then k.notes
    when coalesce(btrim(k.notes), '') = '' then d.notes
    else k.notes || E'\n' || d.notes end,
  order_numbers = (
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
    from jsonb_array_elements(
      (case when jsonb_typeof(k.order_numbers) = 'array' then k.order_numbers else '[]'::jsonb end) ||
      (case when jsonb_typeof(d.order_numbers) = 'array' then d.order_numbers else '[]'::jsonb end)
    ) as e(v)
  ),
  updated_at = now()
from merge_pairs p
join public.customers d on d.id = p.duplicate_id
where k.id = p.keep_id;

-- 4. remove the duplicate (nothing is attached to it any more)
delete from public.customers c using merge_pairs p where c.id = p.duplicate_id;

-- 5. preview of the result
select k.id as kept_customer_id, k.name, k.email, k.phone, k.auth_user_id is not null as has_login,
  (select count(*) from public.orders o where o.customer_id = k.id) as orders_now,
  (select count(*) from public.customer_artwork a where a.customer_id = k.id) as artwork_now
from public.customers k
where k.id in (select keep_id from merge_pairs);

rollback;  -- PREVIEW ONLY. Change to COMMIT only after Marc approves the preview.
