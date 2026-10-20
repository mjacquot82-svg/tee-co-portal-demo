-- Undo supplier-size-charts.sql (drops only the S&S size chart table).
begin;
drop table if exists public.supplier_size_charts;
commit;
