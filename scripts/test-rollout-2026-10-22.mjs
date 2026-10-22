// Runs the Oct 22 rollout SQL against an in-memory Postgres copy (PGlite) seeded with the affected catalogue rows
// from a live backup snapshot (catalogue tables only). Never connects to a real database.
// node scripts/test-rollout-2026-10-22.mjs <live-backup.json>
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const snap = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const R = (k) => { const v = snap[`public.${k}`]; return Array.isArray(v) ? v : v.rows; };
const db = new PGlite();
await db.exec(`
create table public.brands(id uuid primary key, name text unique);
create table public.garment_models(id uuid primary key, brand_id uuid, model_code text, display_name text);
create table public.garment_model_colors(id uuid primary key default gen_random_uuid(), garment_model_id uuid, color_name text, display_order int, active boolean default true, unique(garment_model_id,color_name));
create table public.products(id uuid primary key, name text, brand_model text, brand_lookup_id uuid, garment_model_lookup_id uuid, colors jsonb);
create table public.garment_library_items(id uuid primary key, title text, brand_lookup_id uuid, garment_model_lookup_id uuid, variants jsonb);`);
const codes = ["L07200","L07201","L07260","L07261","H08205"];
const gms = R("garment_models").filter((m) => codes.includes(m.model_code));
const ids = new Set(gms.map((m) => m.id));
const ins = (t, cols, rows) => Promise.all(rows.map((r) => db.query(`insert into public.${t}(${cols.join(",")}) values(${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => (r[c] !== null && typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])))));
await ins("brands", ["id","name"], R("brands"));
await ins("garment_models", ["id","brand_id","model_code","display_name"], gms);
await ins("garment_model_colors", ["id","garment_model_id","color_name","display_order","active"], R("garment_model_colors").filter((c) => ids.has(c.garment_model_id)));
await ins("products", ["id","name","brand_model","brand_lookup_id","garment_model_lookup_id","colors"], R("products").filter((p) => ids.has(p.garment_model_lookup_id)));
await ins("garment_library_items", ["id","title","brand_lookup_id","garment_model_lookup_id","variants"], R("garment_library_items").filter((l) => ids.has(l.garment_model_lookup_id)));
const sql = fs.readFileSync(new URL("../supabase/rollouts/2026-10-22-navigator-cx2-cap-colours-ice-white.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // twice: must be idempotent
const q = async (s) => (await db.query(s)).rows;
const photos = JSON.parse(fs.readFileSync(new URL("./data/teeco-own-photos.json", import.meta.url), "utf8")).photos.filter((p) => p.style === "H08205");
const capColours = (await q(`select colors from products p join garment_models m on m.id=p.garment_model_lookup_id where m.model_code='H08205'`))[0].colors;
const fail = [];
const check = (ok, msg) => { console.log(ok ? "ok  " : "FAIL", msg); if (!ok) fail.push(msg); };
check((await q(`select count(*)::int n from garment_models m join brands b on b.id=m.brand_id where m.model_code in ('L07200','L07201') and b.name='CX2'`))[0].n === 2, "Navigator models are CX2");
check((await q(`select count(*)::int n from products where brand_model in ('CX2 L07200','CX2 L07201')`))[0].n === 2, "Navigator products say CX2");
check((await q(`select count(*)::int n from garment_library_items l join brands b on b.id=l.brand_lookup_id where l.title like '%Navigator%' and b.name='CX2'`))[0].n === 2, "Navigator library items are CX2");
check(capColours.length === 20, `cap has 20 colours (${capColours.length})`);
check(photos.length === 20 && photos.every((p) => capColours.includes(p.color)), "all 20 cap photos match a new cap colour name");
check((await q(`select count(*)::int n from products where colors ? 'Ice White'`))[0].n === 0, "no product lists Ice White");
check((await q(`select count(*)::int n from garment_model_colors where color_name='Ice White' and active`))[0].n === 0, "Ice White colour rows inactive");
check((await q(`select count(*)::int n from garment_library_items l, jsonb_array_elements(l.variants) v where v->>'color'='Ice White' and (v->>'active')::boolean`))[0].n === 0, "Ice White library variants inactive");
check((await q(`select count(*)::int n from garment_model_colors c join garment_models m on m.id=c.garment_model_id where m.model_code='H08205' and c.active`))[0].n === 20, "cap has 20 active colour rows");
process.exit(fail.length ? 1 : 0);
