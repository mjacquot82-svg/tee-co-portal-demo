-- Rollback for supplier-color-images.sql. Removes the S&S colour photo table and its rows.
-- The app falls back to the normal garment images when the table is missing.
begin;
drop table if exists public.supplier_color_images;
commit;
