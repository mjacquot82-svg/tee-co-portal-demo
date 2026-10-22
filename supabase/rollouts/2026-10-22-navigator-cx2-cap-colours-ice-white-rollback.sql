-- Undo 2026-10-22-navigator-cx2-cap-colours-ice-white.sql. The cap's old garbled colour list and library variants
-- are restored from the pre-run backup (take one first: products + garment_library_items rows for H08205).
begin;
do $$ declare h uuid; begin
  select id into h from public.brands where name = 'Heritage 54';
  update public.garment_models set brand_id = h where model_code in ('L07200','L07201');
  update public.products set brand_lookup_id = h, brand_model = regexp_replace(brand_model, '^CX2 ', 'Heritage 54 ')
   where garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07200','L07201'));
  update public.garment_library_items set brand_lookup_id = h
   where garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07200','L07201'));
end $$;
update public.garment_model_colors set active = true
 where color_name = 'Ice White' and garment_model_id in (select id from public.garment_models where model_code in ('L07260','L07261'));
update public.products set colors = colors || '["Ice White"]'::jsonb
 where not colors ? 'Ice White' and garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07260','L07261'));
update public.garment_library_items set variants = (
  select jsonb_agg(case when v->>'color' = 'Ice White' then v || '{"active":true}'::jsonb else v end) from jsonb_array_elements(variants) v)
 where garment_model_lookup_id in (select id from public.garment_models where model_code in ('L07260','L07261'));
delete from public.garment_model_colors where garment_model_id in (select id from public.garment_models where model_code = 'H08205');
commit;
