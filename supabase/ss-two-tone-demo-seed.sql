-- STAGING ONLY demo catalogue rows so the S&S two-tone colour sync can be checked on the staging site.
-- Copies of three Tee & Co catalogue garments (names, sizes and colour lists only; no customer data).
-- Re-runnable. Remove with: delete from public.products where sku like 'SS-DEMO-%';
--   delete from public.garment_models where id in ('5e5e0000-0000-4000-8000-000000005700','5e5e0000-0000-4000-8000-0000000000a6','5e5e0000-0000-4000-8000-000000006606');
begin;
insert into public.brands (name) select v from (values ('Team 365'), ('YP Classic')) b(v)
  where not exists (select 1 from public.brands where name = b.v);
insert into public.garment_models (id, brand_id, model_code, display_name, active) values
  ('5e5e0000-0000-4000-8000-000000005700', (select id from public.brands where name = 'Gildan' limit 1), '5700', 'Gildan Unisex Heavy Cotton Raglan Three-Quarter Sleeve T-Shirt - 5700', true),
  ('5e5e0000-0000-4000-8000-0000000000a6', (select id from public.brands where name = 'Team 365' limit 1), 'TT62', 'Team 365 Unisex Zone Colorblock Raglan T-Shirt - TT62', true),
  ('5e5e0000-0000-4000-8000-000000006606', (select id from public.brands where name = 'YP Classic' limit 1), '6606', 'YP Classics Retro Trucker Cap - 6606', true)
on conflict (id) do nothing;
insert into public.products (id, sku, name, category, brand_model, garment_model_lookup_id, status, colors, sizes, base_garment_price, unit_price, notes) values
  ('5e5e0000-0000-4000-8000-100000005700', 'SS-DEMO-5700', 'Gildan Unisex Heavy Cotton Raglan Three-Quarter Sleeve T-Shirt - 5700', 'Teamwear', 'Gildan 5700', '5e5e0000-0000-4000-8000-000000005700', 'Active',
   '["Sport Grey","Black","Navy","Red","White","Royal"]', '["S","M","L","XL","2XL","3XL"]', 40, 40, 'Staging demo copy for S&S colour sync'),
  ('5e5e0000-0000-4000-8000-1000000000a6', 'SS-DEMO-TT62', 'Team 365 Unisex Zone Colorblock Raglan T-Shirt - TT62', 'Teamwear', 'Team 365 TT62', '5e5e0000-0000-4000-8000-0000000000a6', 'Active',
   '["White","Sport Dark Navy","Heather","Athletic Heather","Sport Red","Dark Grey Heather","Black","Black Heather"]', '["XS","S","M","L","XL","2XL","3XL","4XL"]', 29.98, 29.98, 'Staging demo copy for S&S colour sync'),
  ('5e5e0000-0000-4000-8000-100000006606', 'SS-DEMO-6606', 'YP Classics Retro Trucker Cap - 6606', 'Hats', 'YP Classic 6606', '5e5e0000-0000-4000-8000-000000006606', 'Active',
   '["White","Black","Brown","Khaki","Caramel","Charcoal","Navy","Neon Green","Neon Orange","Moss","Royal","Grey","Tan"]', '["One Size"]', 30, 30, 'Staging demo copy for S&S colour sync')
on conflict (id) do nothing;
commit;
