-- READ-ONLY REPORT: possible duplicate customer profiles.
-- Changes nothing (SELECT only, inside a read-only transaction). Safe to run in the Supabase SQL editor.
-- Matches profiles that share a login (auth_user_id), an email, a phone number (last 10 digits)
-- or a name. "auth_user_id" matches are the strongest: one login linked to two profiles.
-- For each profile it shows how much is attached to it and suggests which one to keep:
-- the one linked to a login, then one with a real name (not the automatic "Customer Account"),
-- then the one with most orders, then the oldest. It is only a suggestion.
-- Next step (only after Marc reviews): customer-duplicates-merge-PROPOSED-NOT-RUN.sql

begin transaction read only;

with c as (
  select
    id,
    name,
    company,
    email,
    phone,
    auth_user_id,
    created_at,
    nullif(lower(btrim(email)), '') as email_key,
    case when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 7
         then right(regexp_replace(phone, '\D', '', 'g'), 10) end as phone_key,
    nullif(btrim(auth_user_id), '') as auth_key,
    nullif(regexp_replace(lower(btrim(name)), '\s+', ' ', 'g'), '') as name_key
  from public.customers
),
signals as (
  select 'login (auth_user_id)' as matched_on, 1 as strength, auth_key as match_value, id from c where auth_key is not null
  union all select 'email', 2, email_key, id from c where email_key is not null
  union all select 'phone', 3, phone_key, id from c where phone_key is not null
  union all select 'name', 4, name_key, id from c where name_key is not null and name_key <> 'customer account'
),
groups as (
  select matched_on, strength, match_value, array_agg(id order by id) as ids
  from signals
  group by matched_on, strength, match_value
  having count(*) > 1
),
attached as (
  select
    c.id,
    (select count(*) from public.orders o where o.customer_id = c.id) as orders,
    (select count(*) from public.customer_artwork a where a.customer_id = c.id) as artwork,
    (select count(*) from public.payment_requests pr where pr.customer_id = c.id) as payment_requests,
    (select count(*) from public.payments p where p.customer_id = c.id) as payments,
    (select count(*) from public.sales s where s.customer_id = c.id) as sales,
    (select count(*) from public.square_terminal_checkout_attempts t where t.customer_id = c.id) as terminal_attempts
  from c
)
select
  g.matched_on,
  g.match_value,
  dense_rank() over (order by g.strength, g.match_value) as group_no,
  c.id as customer_id,
  c.name,
  c.company,
  c.email,
  c.phone,
  c.auth_user_id is not null and btrim(c.auth_user_id) <> '' as has_login,
  c.created_at,
  a.orders, a.artwork, a.payment_requests, a.payments, a.sales, a.terminal_attempts,
  (row_number() over (
     partition by g.matched_on, g.match_value
     order by (c.auth_key is not null) desc, (coalesce(c.name_key, 'customer account') <> 'customer account') desc,
              a.orders desc, c.created_at asc, c.id asc
   ) = 1) as suggested_keep
from groups g
cross join lateral unnest(g.ids) as gid(id)
join c on c.id = gid.id
join attached a on a.id = c.id
order by g.strength, g.match_value, suggested_keep desc, c.created_at;

rollback;
