-- DEMO SEED (staging only): S&S colour photos for Gildan 5000 and Gildan 64000, 16 common colours each.
-- Image paths copied from S&S's public product pages on 2026-10-19; every URL was checked on the CDN.
-- No customer data. Run after supplier-color-images.sql. Re-runnable (updates on conflict).
-- Remove with: delete from public.supplier_color_images where source = 'demo_seed';
begin;
insert into public.supplier_color_images (brand_name, style_name, style_key, style_id, color_name, color_key, color_style_id, color_swatch_image, color_front_image, color_back_image, color_side_image, color_direct_side_image, color_on_model_front_image, color_on_model_back_image, color_on_model_side_image, source)
values
  ('Gildan', '5000', 'gildan|5000', 16, 'White', 'white', 16813, 'Images/ColorSwatch/16813_fm.jpg', 'Images/Color/16813_f_fm.jpg', 'Images/Color/16813_b_fm.jpg', null, 'Images/Color/16813_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Black', 'black', 16787, 'Images/ColorSwatch/16787_fm.jpg', 'Images/Color/16787_f_fm.jpg', 'Images/Color/16787_b_fm.jpg', null, 'Images/Color/16787_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Navy', 'navy', 16803, 'Images/ColorSwatch/16803_fm.jpg', 'Images/Color/16803_f_fm.jpg', 'Images/Color/16803_b_fm.jpg', null, 'Images/Color/16803_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Sport Grey', 'sport grey', 16810, 'Images/ColorSwatch/16810_fm.jpg', 'Images/Color/16810_f_fm.jpg', 'Images/Color/16810_b_fm.jpg', null, 'Images/Color/16810_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Red', 'red', 27239, 'Images/ColorSwatch/27239_fm.jpg', 'Images/Color/27239_f_fm.jpg', 'Images/Color/27239_b_fm.jpg', null, 'Images/Color/27239_d_fm.jpg', 'Images/ModelColor/27239_omf_fm.jpg', 'Images/ModelColor/27239_omb_fm.jpg', 'Images/ModelColor/27239_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Royal', 'royal', 16806, 'Images/ColorSwatch/16806_fm.jpg', 'Images/Color/16806_f_fm.jpg', 'Images/Color/16806_b_fm.jpg', null, 'Images/Color/16806_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Charcoal', 'charcoal', 16790, 'Images/ColorSwatch/16790_fm.jpg', 'Images/Color/16790_f_fm.jpg', 'Images/Color/16790_b_fm.jpg', null, 'Images/Color/16790_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Maroon', 'maroon', 27238, 'Images/ColorSwatch/27238_fm.jpg', 'Images/Color/27238_f_fm.jpg', 'Images/Color/27238_b_fm.jpg', null, 'Images/Color/27238_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Forest Green', 'forest green', 16793, 'Images/ColorSwatch/16793_fm.jpg', 'Images/Color/16793_f_fm.jpg', 'Images/Color/16793_b_fm.jpg', null, 'Images/Color/16793_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Sand', 'sand', 16807, 'Images/ColorSwatch/16807_fm.jpg', 'Images/Color/16807_f_fm.jpg', 'Images/Color/16807_b_fm.jpg', null, 'Images/Color/16807_d_fm.jpg', 'Images/ModelColor/16807_omf_fm.jpg', 'Images/ModelColor/16807_omb_fm.jpg', 'Images/ModelColor/16807_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Purple', 'purple', 30032, 'Images/ColorSwatch/30032_fm.jpg', 'Images/Color/30032_f_fm.jpg', 'Images/Color/30032_b_fm.jpg', null, 'Images/Color/30032_d_fm.jpg', 'Images/ModelColor/30032_omf_fm.jpg', 'Images/ModelColor/30032_omb_fm.jpg', 'Images/ModelColor/30032_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Gold', 'gold', 30026, 'Images/ColorSwatch/30026_fm.jpg', 'Images/Color/30026_f_fm.jpg', 'Images/Color/30026_b_fm.jpg', null, 'Images/Color/30026_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Light Blue', 'light blue', 16798, 'Images/ColorSwatch/16798_fm.jpg', 'Images/Color/16798_f_fm.jpg', 'Images/Color/16798_b_fm.jpg', null, 'Images/Color/16798_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Dark Heather', 'dark heather', 40520, 'Images/ColorSwatch/40520_fm.jpg', 'Images/Color/40520_f_fm.jpg', 'Images/Color/40520_b_fm.jpg', null, 'Images/Color/40520_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Military Green', 'military green', 30031, 'Images/ColorSwatch/30031_fm.jpg', 'Images/Color/30031_f_fm.jpg', 'Images/Color/30031_b_fm.jpg', null, 'Images/Color/30031_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '5000', 'gildan|5000', 16, 'Natural', 'natural', 16802, 'Images/ColorSwatch/16802_fm.jpg', 'Images/Color/16802_f_fm.jpg', 'Images/Color/16802_b_fm.jpg', null, 'Images/Color/16802_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'White', 'white', 29885, 'Images/ColorSwatch/29885_fm.jpg', 'Images/Color/29885_f_fm.jpg', 'Images/Color/29885_b_fm.jpg', null, 'Images/Color/29885_d_fm.jpg', 'Images/ModelColor/29885_omf_fm.jpg', 'Images/ModelColor/29885_omb_fm.jpg', 'Images/ModelColor/29885_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Black', 'black', 29881, 'Images/ColorSwatch/29881_fm.jpg', 'Images/Color/29881_f_fm.jpg', 'Images/Color/29881_b_fm.jpg', null, 'Images/Color/29881_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Navy', 'navy', 29883, 'Images/ColorSwatch/29883_fm.jpg', 'Images/Color/29883_f_fm.jpg', 'Images/Color/29883_b_fm.jpg', null, 'Images/Color/29883_d_fm.jpg', 'Images/ModelColor/29883_omf_fm.jpg', 'Images/ModelColor/29883_omb_fm.jpg', 'Images/ModelColor/29883_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Sport Grey', 'sport grey', 29884, 'Images/ColorSwatch/29884_fm.jpg', 'Images/Color/29884_f_fm.jpg', 'Images/Color/29884_b_fm.jpg', null, 'Images/Color/29884_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Red', 'red', 29869, 'Images/ColorSwatch/29869_fm.jpg', 'Images/Color/29869_f_fm.jpg', 'Images/Color/29869_b_fm.jpg', null, 'Images/Color/29869_d_fm.jpg', 'Images/ModelColor/29869_omf_fm.jpg', null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Royal', 'royal', 29870, 'Images/ColorSwatch/29870_fm.jpg', 'Images/Color/29870_f_fm.jpg', 'Images/Color/29870_b_fm.jpg', null, 'Images/Color/29870_d_fm.jpg', 'Images/ModelColor/29870_omf_fm.jpg', 'Images/ModelColor/29870_omb_fm.jpg', 'Images/ModelColor/29870_oms_fm.jpg', 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Charcoal', 'charcoal', 16925, 'Images/ColorSwatch/16925_fm.jpg', 'Images/Color/16925_f_fm.jpg', 'Images/Color/16925_b_fm.jpg', null, 'Images/Color/16925_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Maroon', 'maroon', 29868, 'Images/ColorSwatch/29868_fm.jpg', 'Images/Color/29868_f_fm.jpg', 'Images/Color/29868_b_fm.jpg', 'Images/Color/29868_fm.jpg', null, null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Forest', 'forest', 29882, 'Images/ColorSwatch/29882_fm.jpg', 'Images/Color/29882_f_fm.jpg', 'Images/Color/29882_b_fm.jpg', 'Images/Color/29882_fm.jpg', null, null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Sand', 'sand', 16937, null, 'Images/Color/16937_f_fm.jpg', 'Images/Color/16937_b_fm.jpg', 'Images/Color/16937_fm.jpg', null, null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Purple', 'purple', 37320, 'Images/ColorSwatch/37320_fm.jpg', 'Images/Color/37320_f_fm.jpg', 'Images/Color/37320_b_fm.jpg', null, 'Images/Color/37320_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Heather Navy', 'heather navy', 32216, 'Images/ColorSwatch/32216_fm.jpg', 'Images/Color/32216_f_fm.jpg', 'Images/Color/32216_b_fm.jpg', 'Images/Color/32216_fm.jpg', null, null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Dark Heather', 'dark heather', 32215, 'Images/ColorSwatch/32215_fm.jpg', 'Images/Color/32215_f_fm.jpg', 'Images/Color/32215_b_fm.jpg', null, 'Images/Color/32215_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Military Green', 'military green', 16933, 'Images/ColorSwatch/16933_fm.jpg', 'Images/Color/16933_f_fm.jpg', 'Images/Color/16933_b_fm.jpg', 'Images/Color/16933_fm.jpg', null, null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Natural', 'natural', 52386, null, 'Images/Color/52386_f_fm.jpg', 'Images/Color/52386_b_fm.jpg', null, 'Images/Color/52386_d_fm.jpg', null, null, null, 'demo_seed'),
  ('Gildan', '64000', 'gildan|64000', 32, 'Light Blue', 'light blue', 16932, null, 'Images/Color/16932_f_fm.jpg', 'Images/Color/16932_b_fm.jpg', null, 'Images/Color/16932_d_fm.jpg', null, null, null, 'demo_seed')
on conflict (supplier, style_key, color_key) do update set
  brand_name = excluded.brand_name,
  style_name = excluded.style_name,
  style_id = excluded.style_id,
  color_name = excluded.color_name,
  color_style_id = excluded.color_style_id,
  color_swatch_image = excluded.color_swatch_image,
  color_front_image = excluded.color_front_image,
  color_back_image = excluded.color_back_image,
  color_side_image = excluded.color_side_image,
  color_direct_side_image = excluded.color_direct_side_image,
  color_on_model_front_image = excluded.color_on_model_front_image,
  color_on_model_back_image = excluded.color_on_model_back_image,
  color_on_model_side_image = excluded.color_on_model_side_image,
  source = excluded.source, active = true, updated_at = now();
commit;
