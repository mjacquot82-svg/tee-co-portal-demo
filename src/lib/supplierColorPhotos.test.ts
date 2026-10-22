import { describe, expect, it, vi } from "vitest";
import demo from "../../scripts/data/ss-demo-colours.json";
import {
  buildColorPhotoViews,
  buildSsImageUrl,
  buildStyleKey,
  clearSupplierColorImagesCache,
  fetchSupplierColorImages,
  findColorPhotoRecord,
  mapSsProductRowsToColorImages,
  resolveSupplierStyle,
} from "./supplierColorPhotos";
import { assertStagingTarget, filterByStyles, parseArgs, parseStyleFilter } from "../../scripts/import-ss-products.mjs";

describe("S&S image URLs", () => {
  it("builds CDN URLs from file paths, short paths and full URLs", () => {
    expect(buildSsImageUrl("Images/Color/16813_f_fm.jpg", "large")).toBe("https://cdn.ssactivewear.com/Images/Color/16813_f_fl.jpg");
    expect(buildSsImageUrl("Color/16813_b", "small")).toBe("https://cdn.ssactivewear.com/Images/Color/16813_b_fs.jpg");
    expect(buildSsImageUrl("https://cdn.ssactivewear.com/Images/Color/16813_d_fl.jpg")).toBe("https://cdn.ssactivewear.com/Images/Color/16813_d_fm.jpg");
    expect(buildSsImageUrl("Images/Color/29868_fm.jpg", "large")).toBe("https://cdn.ssactivewear.com/Images/Color/29868_fl.jpg");
    expect(buildSsImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(buildSsImageUrl("")).toBe("");
  });
});

describe("matching catalog products to S&S styles", () => {
  it("reads the style from live-style names and brand_model", () => {
    expect(resolveSupplierStyle({ name: "Gildan Youth Heavy Cotton™ T-Shirt - 5000B" })).toEqual({ brand: "Gildan", style: "5000B" });
    expect(resolveSupplierStyle({ brand_model: "Gildan 64000", name: "Softstyle tee" })).toEqual({ brand: "Gildan", style: "64000" });
    expect(resolveSupplierStyle({}, { garment_id: "TSHIRT_GILDAN_64000", brand: "Gildan" })).toEqual({ brand: "Gildan", style: "64000" });
    expect(resolveSupplierStyle({ supplier_brand: "Bella+Canvas", supplier_style: "3001" })).toEqual({ brand: "Bella+Canvas", style: "3001" });
    expect(resolveSupplierStyle({ name: "Custom mug" })).toBeNull();
    expect(buildStyleKey("Gildan", "5000B")).toBe("gildan|5000b");
  });
});

describe("colour photo views", () => {
  const records = mapSsProductRowsToColorImages(demo.rows, { source: "demo_seed" });

  it("maps the demo file to one row per colour", () => {
    expect(records).toHaveLength(32);
    const white = records.find((r) => r.style_key === "gildan|5000" && r.color_key === "white");
    expect(white).toMatchObject({ supplier: "ss_activewear", color_style_id: 16813, source: "demo_seed", active: true });
  });

  it("dedupes SKU rows (one per size) to a single colour", () => {
    const row = { brandName: "Gildan", styleName: "5000", colorName: "Black", colorFrontImage: "Images/Color/16787_f_fm.jpg" };
    expect(mapSsProductRowsToColorImages([row, { ...row, sizeName: "XL" }])).toHaveLength(1);
  });

  it("gives front, back and side, plus on-model where S&S has it", () => {
    const red = findColorPhotoRecord(records.filter((r) => r.style_key === "gildan|5000"), "RED");
    expect(buildColorPhotoViews(red).map((v) => v.view)).toEqual(["front", "back", "side", "model-front", "model-back", "model-side"]);
    const black = findColorPhotoRecord(records.filter((r) => r.style_key === "gildan|5000"), "Black");
    const views = buildColorPhotoViews(black);
    expect(views.map((v) => v.label)).toEqual(["Front", "Back", "Side"]);
    expect(views[0].src).toBe("https://cdn.ssactivewear.com/Images/Color/16787_f_fl.jpg");
    expect(views[0].thumb).toBe("https://cdn.ssactivewear.com/Images/Color/16787_f_fs.jpg");
  });

  it("returns no views when the colour is unknown (page keeps its normal image)", () => {
    expect(buildColorPhotoViews(findColorPhotoRecord(records, "Not A Colour"))).toEqual([]);
    expect(buildColorPhotoViews(null)).toEqual([]);
  });
});

describe("loading from Supabase", () => {
  function fakeClient(result) {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), then: (resolve) => resolve(result) };
    return { from: vi.fn(() => query), query };
  }

  it("asks once per style and caches", async () => {
    clearSupplierColorImagesCache();
    const client = fakeClient({ data: [{ color_name: "White" }], error: null });
    await fetchSupplierColorImages(client, { brand: "Gildan", style: "5000" });
    const rows = await fetchSupplierColorImages(client, { brand: "Gildan", style: "5000" });
    expect(rows).toEqual([{ color_name: "White" }]);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.query.eq).toHaveBeenCalledWith("style_key", "gildan|5000");
  });

  it("falls back to no photos when the table is missing", async () => {
    clearSupplierColorImagesCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = fakeClient({ data: null, error: { code: "42P01", message: "missing" } });
    expect(await fetchSupplierColorImages(client, { brand: "Gildan", style: "5000" })).toEqual([]);
    warn.mockRestore();
  });
});

describe("import script safety", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseArgs(["--demo"]).apply).toBe(false);
    expect(parseArgs(["--demo", "--apply"]).apply).toBe(true);
    expect(() => parseArgs([])).toThrow(/exactly one source/);
    expect(() => parseArgs(["--api"])).toThrow(/--style/);
  });

  it("refuses the live project", () => {
    expect(() => assertStagingTarget("https://iwbajhxrgyjferbkibkl.supabase.co")).toThrow(/LIVE/);
    expect(() => assertStagingTarget("")).toThrow();
    expect(assertStagingTarget("https://staging-ref.supabase.co")).toBe("https://staging-ref.supabase.co");
  });

  it("filters by style", () => {
    const records = mapSsProductRowsToColorImages(demo.rows);
    expect(filterByStyles(records, [parseStyleFilter("Gildan 64000")])).toHaveLength(16);
  });
});
