-- Tee & Co catalogue fixes from Teresa (Oct 22 2026). LIVE ROLLOUT STEP: run by hand, after closing, with Marc's OK.
-- Not in supabase/migrations on purpose, so it never runs on its own. Safe to re-run (idempotent).
-- 1) Navigator jackets L07200 / L07201 are CX2, not Heritage 54.
-- 2) H08205 trucker cap colours -> the 20 official names from the 24/7 spec sheet.
-- 3) Ice White removed from Balmy L07260 / L07261 (out of stock in all sizes). Soft: the colour row is deactivated, not deleted.
-- Rollback: 2026-10-22-navigator-cx2-cap-colours-ice-white-rollback.sql
begin;

do $$
declare cx2 uuid; heritage uuid;
begin
  select id into cx2 from public.brands where name = 'CX2';
  select id into heritage from public.brands where name = 'Heritage 54';
  if cx2 is null then raise exception 'CX2 brand missing'; end if;
  update public.garment_models set brand_id = cx2 where model_code in ('L07200','L07201') and brand_id is distinct from cx2;
  update public.products p set brand_lookup_id = cx2,
         brand_model = regexp_replace(p.brand_model, '^Heritage 54 ', 'CX2 ')
   where p.garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07200','L07201'));
  update public.garment_library_items set brand_lookup_id = cx2
   where garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07200','L07201'));
end $$;

-- 2) Cap colours
create temp table _cap_colours(ord int, name text) on commit drop;
insert into _cap_colours values
 (1,'Black'),(2,'Navy'),(3,'Charcoal'),(4,'Black Camo'),(5,'Grey Camo'),
 (6,'Black-White'),(7,'Navy-White'),(8,'Grey Heather-White'),(9,'Grey Heather-Black'),(10,'Charcoal-Black'),
 (11,'Caramel-Black'),(12,'Brown-Khaki'),(13,'Moss-Khaki'),
 (14,'Forest Green-Black-White'),(15,'Gold-Black-White'),(16,'Orange-Black-White'),(17,'Maroon-Black-White'),
 (18,'Grey-Black-White'),(19,'Red-Black-White'),(20,'Royal-Black-White');

update public.products set colors = (select jsonb_agg(name order by ord) from _cap_colours)
 where garment_model_lookup_id in (select id from public.garment_models where model_code = 'H08205');

update public.garment_library_items set variants = (
  select jsonb_agg(jsonb_build_object('id','variant-h08205-'||ord,'sku','','name',name,'size','One Size','color',name,
         'sizes',jsonb_build_array('One Size'),'active',true,'colors',jsonb_build_array(name),'supplier_sku','','supplier_variant',name) order by ord)
  from _cap_colours)
 where garment_model_lookup_id in (select id from public.garment_models where model_code = 'H08205');

update public.garment_model_colors set active = false
 where garment_model_id in (select id from public.garment_models where model_code = 'H08205')
   and color_name not in (select name from _cap_colours);
insert into public.garment_model_colors (garment_model_id, color_name, display_order, active)
select m.id, c.name, c.ord, true from public.garment_models m cross join _cap_colours c where m.model_code = 'H08205'
on conflict (garment_model_id, color_name) do update set active = true, display_order = excluded.display_order;

-- 3) Ice White off the Balmy jackets
update public.garment_model_colors set active = false
 where color_name = 'Ice White' and garment_model_id in (select id from public.garment_models where model_code in ('L07260','L07261'));
update public.products set colors = coalesce((select jsonb_agg(c) from jsonb_array_elements(colors) c where c <> '"Ice White"'::jsonb), '[]'::jsonb)
 where colors ? 'Ice White' and garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07260','L07261'));
update public.garment_library_items set variants = (
  select jsonb_agg(case when v->>'color' = 'Ice White' then v || '{"active":false}'::jsonb else v end) from jsonb_array_elements(variants) v)
 where garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07260','L07261'));

commit;
