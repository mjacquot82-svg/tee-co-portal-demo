#!/usr/bin/env node
// Sync the Tee & Co catalogue colour lists with S&S for styles marked in scripts/data/tee-co-ss-styles.json:
//   all_ss_colors: true  -> the colour list becomes S&S's full list for that style (two-tone styles)
//   removed_colors: [..] -> those colours are taken off the list (discontinued at S&S)
// Writes SQL only (stdout or --out file); it never connects to a database. Run the SQL on STAGING first.
// Safety: a colour is NOT removed if any order mentions it together with the style; it is kept and
// reported in the final result set (column "flag"). garment_model_colors rows are deactivated, not deleted.
// Usage: node scripts/sync-ss-catalog-colors.mjs --datalibrary SNS_Canada_DataLibrary.zip \
//          --catalog scripts/data/tee-co-ss-styles.json --out sync.sql

import fs from "node:fs";
import { readDataLibrary } from "./import-ss-products.mjs";

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const arr = (list) => `array[${list.map(q).join(",")}]::text[]`;

export function buildSyncSql(productRows, catalog) {
  const parts = [
    "begin;",
    "create temp table ss_sync_report (style text, product text, flag text, detail text) on commit drop;",
  ];
  for (const entry of catalog.styles || []) {
    if (!entry.all_ss_colors && !entry.removed_colors?.length) continue;
    const words = String(entry.ss_style).trim().split(/\s+/);
    const style = words[words.length - 1];
    const ssColors = [];
    for (const row of productRows) {
      if (Number(row.styleID) !== Number(entry.styleID)) continue;
      const name = String(row.colorName || "").trim();
      if (name && !ssColors.includes(name)) ssColors.push(name);
    }
    const allSs = Boolean(entry.all_ss_colors);
    const removed = entry.removed_colors || [];
    parts.push(`do $$
declare p record; cur text[]; want text[]; keep text[]; c text; i int;
begin
  for p in select id, name, colors, garment_model_lookup_id from public.products
           where brand_model ~* ${q(`(^|\\s)${style}$`)} or name ~* ${q(`[-\\s]${style}$`)} loop
    select coalesce(array_agg(x), '{}') into cur from jsonb_array_elements_text(coalesce(p.colors, '[]'::jsonb)) x;
    want := ${allSs ? arr(ssColors) : `array(select x from unnest(cur) x where lower(x) <> all (${arr(removed.map((r) => r.toLowerCase()))}))`};
    keep := '{}';
    foreach c in array cur loop
      if lower(c) <> all (select lower(w) from unnest(want) w)
         and exists (select 1 from public.orders o where o::text ilike '%' || c || '%' and o::text ilike '%' || ${q(style)} || '%') then
        keep := keep || c;
        insert into ss_sync_report values (${q(entry.ss_style)}, p.name, 'KEPT_REFERENCED_BY_ORDER', c);
      end if;
    end loop;
    want := want || keep;
    update public.products set colors = to_jsonb(want), updated_at = now() where id = p.id;
    insert into ss_sync_report values (${q(entry.ss_style)}, p.name, 'colours', cardinality(cur) || ' -> ' || cardinality(want));
    if p.garment_model_lookup_id is not null then
      update public.garment_model_colors set active = false, updated_at = now()
        where garment_model_id = p.garment_model_lookup_id and lower(color_name) <> all (select lower(w) from unnest(want) w);
      i := 0;
      foreach c in array want loop
        i := i + 1;
        insert into public.garment_model_colors (garment_model_id, color_name, display_order, active)
          values (p.garment_model_lookup_id, c, i, true)
          on conflict (garment_model_id, color_name) do update set active = true, display_order = excluded.display_order, updated_at = now();
      end loop;
    end if;
  end loop;
end $$;`);
  }
  parts.push("select * from ss_sync_report order by 1, 2, 3;", "commit;");
  return parts.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag) => args[args.indexOf(flag) + 1];
  const library = readDataLibrary(get("--datalibrary"));
  const catalog = JSON.parse(fs.readFileSync(get("--catalog"), "utf8"));
  const sql = buildSyncSql(library.products, catalog);
  if (args.includes("--out")) fs.writeFileSync(get("--out"), sql);
  else process.stdout.write(sql);
}
