import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { atomicImageSwap, guardedRollback, imageSnapshot, sha256, verifyPublicImage, verifyLiveStorageReader } from "./product-image-migration-safety.mjs";
const migrationPath = new URL("../supabase/migrations/20261011152424_atomic_product_image_swap.sql", import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
const bytes = Buffer.from("original-image-bytes");
const before = imageSnapshot({ image: `data:image/png;base64,${bytes.toString("base64")}` });
const after = imageSnapshot({ image: "https://example.test/original.png", image_storage_path: "original.png", image_thumb_storage_path: "thumb.webp", image_content_type: "image/png", image_file_size: bytes.length, image_updated_at: "2026-10-11T15:00:00Z" });
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.products (id uuid primary key, image text, image_storage_path text, image_thumb_storage_path text, image_content_type text, image_file_size bigint, image_updated_at timestamptz, name text, unit_price numeric);
    grant select,update on public.products to service_role;`);
  await db.exec(await fs.readFile(migrationPath, "utf8"));
  await db.query("insert into products(id,image,name,unit_price) values ($1,$2,'Keep this name',55)", [id, before.image]);
  const client = { rpc: async (_name, args) => {
    const result = await db.query("select public.compare_and_swap_product_images($1,$2,$3) as result", [args.p_product_id, args.p_expected, args.p_replacement]);
    return { data: result.rows[0].result, error: null };
  } };
  return { db, client };
}
test("atomic swap, idempotent retry and guarded rollback preserve unrelated data", async () => {
  const { db, client } = await fixture();
  try {
    assert.equal(await atomicImageSwap(client,id,before,after),"changed");
    assert.equal(await atomicImageSwap(client,id,before,after),"already-applied");
    const entry = { version:2,productId:id,previous:before,expectedAfter:after,originalSha256:sha256(bytes) };
    assert.equal(await guardedRollback(client,entry),"changed");
    assert.equal(await guardedRollback(client,entry),"already-applied");
    const row=(await db.query("select * from products where id=$1",[id])).rows[0];
    assert.equal(row.image,before.image); assert.equal(row.name,"Keep this name"); assert.equal(Number(row.unit_price),55);
  } finally { await db.close(); }
});
test("concurrent image/metadata edits refuse both migration and rollback", async () => {
  const { db,client }=await fixture();
  try {
    await db.query("update products set image_thumb_storage_path='staff-edit.webp' where id=$1",[id]);
    assert.equal(await atomicImageSwap(client,id,before,after),"conflict");
    await db.query("update products set image_thumb_storage_path=null where id=$1",[id]);
    assert.equal(await atomicImageSwap(client,id,before,after),"changed");
    await db.query("update products set image_updated_at='2026-10-11T16:00:00Z' where id=$1",[id]);
    assert.equal(await guardedRollback(client,{ version:2,productId:id,previous:before,expectedAfter:after,originalSha256:sha256(bytes) }),"conflict");
    assert.equal((await db.query("select image from products where id=$1",[id])).rows[0].image,after.image);
  } finally { await db.close(); }
});
test("competing migration attempts yield only one changed row", async () => {
  const { db,client }=await fixture();
  try {
    const alternate={...after,image:"https://example.test/other.png",image_storage_path:"other.png"};
    const statuses=await Promise.all([atomicImageSwap(client,id,before,after),atomicImageSwap(client,id,before,alternate)]);
    assert.deepEqual(statuses.sort(),["changed","conflict"]);
  } finally { await db.close(); }
});
test("public roles cannot execute and extra unrelated fields are rejected", async () => {
  const { db }=await fixture();
  try {
    const result=await db.query("select has_function_privilege('anon','public.compare_and_swap_product_images(uuid,jsonb,jsonb)','execute') as anon, has_function_privilege('authenticated','public.compare_and_swap_product_images(uuid,jsonb,jsonb)','execute') as authenticated, has_function_privilege('service_role','public.compare_and_swap_product_images(uuid,jsonb,jsonb)','execute') as service");
    assert.deepEqual(result.rows[0],{anon:false,authenticated:false,service:true});
    await assert.rejects(db.query("select public.compare_and_swap_product_images($1,$2,$3)",[id,before,{...after,unit_price:0}]),/six image fields/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select public.compare_and_swap_product_images($1,$2,$3)",[id,before,after]),/permission denied/);
  } finally { await db.close(); }
});
test("legacy and damaged rollback records fail closed without invoking RPC", async () => {
  const client={rpc:()=>{throw new Error("must not run");}};
  await assert.rejects(guardedRollback(client,{productId:id,previous:before}),/version 2/);
  await assert.rejects(guardedRollback(client,{version:2,productId:id,previous:before,expectedAfter:after,originalSha256:"bad"}),/hash mismatch/);
});
test("public verification requires matching bytes, MIME and cache policy", async () => {
  const response=(body=bytes,type="image/png",cache="public, max-age=31536000")=>new Response(body,{headers:{"content-type":type,"cache-control":cache}});
  await verifyPublicImage("https://example.test/image",bytes,"image/png",async()=>response());
  await assert.rejects(verifyPublicImage("https://example.test/image",bytes,"image/png",async()=>response(Buffer.from("wrong"))),/bytes/);
  await assert.rejects(verifyPublicImage("https://example.test/image",bytes,"image/png",async()=>response(bytes,"text/html")),/MIME/);
  await assert.rejects(verifyPublicImage("https://example.test/image",bytes,"image/png",async()=>response(bytes,"image/png","no-cache")),/cache/);
});

test("migration journals originals before uploads and verifies both objects before swapping", async () => {
  const { executeMigration } = await import("./migrate-product-images-to-storage.mjs");
  const os = await import("node:os"); const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tee-migration-"));
  const png = Buffer.from("89504e470d0a1a0a001122", "hex");
  const webp = Buffer.from("524946460400000057454250001122", "hex");
  const product = {id, name:"Test",image:`data:image/png;base64,${png.toString("base64")}`};
  const thumbnail = path.join(dir,"thumb.webp"); await fs.writeFile(thumbnail,webp);
  const manifest = path.join(dir,"thumbnails.json");
  await fs.writeFile(manifest,JSON.stringify([{id,thumbnail,sha256_original:sha256(png),sha256_thumbnail:sha256(webp)}]));
  const outputDir=path.join(dir,"journal"); const events=[]; const objects=new Map(); let current=product;
  const client={
    rpc:async (_name,args)=>{
      if(args.p_product_id.startsWith("00000000")) return {data:{status:"missing"}};
      events.push("swap"); assert.deepEqual(events.slice(0,4),["upload","upload","verified","verified"]);
      current={...product,...args.p_replacement}; return {data:{status:"changed"}};
    },
    storage:{from:()=>({
      getPublicUrl:(key)=>({data:{publicUrl:`https://example.test/${key}`}}),
      upload:async (key,body,options)=>{
        const journal=JSON.parse((await fs.readFile(path.join(outputDir,"rollback.jsonl"),"utf8")).trim());
        assert.equal(journal.previous.image,product.image); assert.equal(journal.version,2);
        assert.equal(options.upsert,false); events.push("upload"); objects.set(`https://example.test/${key}`,{body,type:options.contentType}); return {error:null};
      },
    })},
    from:()=>({select:()=>({order:()=>({range:async()=>({data:[product]})}),eq:()=>({single:async()=>({data:current})})})}),
  };
  try {
    const summary=await executeMigration({outputDir,thumbnailManifest:manifest,pageSize:1000,batchSize:3},{client,fetch:async url=>{
      if (url === "https://teeandco.jdsstudio.ca/") return new Response('<meta name="tee-co-storage-image-reader" content="2" />');
      const object=objects.get(url); events.push("verified");
      return new Response(object.body,{headers:{"content-type":object.type,"cache-control":"public, max-age=31536000"}});
    }});
    assert.equal(summary.migrated,1); assert.equal(current.name,product.name);
    assert.match(current.image_thumb_storage_path,/\.webp$/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test("failed public verification stops migration without a product update", async () => {
  const { executeMigration } = await import("./migrate-product-images-to-storage.mjs");
  const os=await import("node:os");const path=await import("node:path");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"tee-migration-failure-"));
  const png=Buffer.from("89504e470d0a1a0a001122","hex"),webp=Buffer.from("524946460400000057454250001122","hex");
  const thumbnail=path.join(dir,"thumb.webp"),manifest=path.join(dir,"manifest.json");
  await fs.writeFile(thumbnail,webp);await fs.writeFile(manifest,JSON.stringify([{id,thumbnail,sha256_original:sha256(png),sha256_thumbnail:sha256(webp)}]));
  let writes=0;
  const client={rpc:async(_n,a)=>{if(a.p_product_id.startsWith("00000000"))return{data:{status:"missing"}};writes++;throw Error("must not update");},storage:{from:()=>({getPublicUrl:key=>({data:{publicUrl:`https://example.test/${key}`}}),upload:async()=>({error:null})})},from:()=>({select:()=>({order:()=>({range:async()=>({data:[{id,image:`data:image/png;base64,${png.toString("base64")}`} ]})})})})};
  try {
    await assert.rejects(executeMigration({outputDir:path.join(dir,"journal"),thumbnailManifest:manifest,pageSize:1000,batchSize:3},{client,fetch:async url=>url === "https://teeandco.jdsstudio.ca/" ? new Response('<meta name="tee-co-storage-image-reader" content="2" />') : new Response("not an image",{headers:{"content-type":"text/html"}})}),/stopped after failure/);
    assert.equal(writes,0);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test("migration refuses a live storefront without the Storage reader", async()=>{
  await assert.rejects(verifyLiveStorageReader(async()=>new Response("old app")),/deploy and verify/);
});
