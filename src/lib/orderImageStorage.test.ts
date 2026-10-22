import { describe, expect, it, vi } from "vitest";
import {
  buildOrderImageStoragePath,
  collectInlineProductImages,
  externalizeOrderProductImages,
} from "./orderImageStorage";
import { buildSupabaseOrderPayload, buildSupabaseOrderUpdatePatch } from "./ordersRepository";

const PNG = "data:image/png;base64," + Buffer.from("fake-png-bytes").toString("base64");
const JPG = "data:image/jpeg;base64," + Buffer.from("fake-jpg-bytes").toString("base64");
const ART = "data:image/png;base64," + Buffer.from("private-artwork").toString("base64");

function fakeClient({ failUpload = false, existing = false } = {}) {
  const uploads: string[] = [];
  const bucket = {
    upload: vi.fn(async (path: string) => {
      uploads.push(path);
      if (failUpload) return { error: { message: "new row violates row-level security policy", statusCode: "403" } };
      if (existing) return { error: { message: "The resource already exists", statusCode: "409" } };
      return { error: null };
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
  };
  return { uploads, client: { storage: { from: vi.fn(() => bucket) } } };
}

const order = {
  order_number: "TC-1",
  product_image: PNG,
  line_items: [{ product_image: PNG }, { product_image: JPG }],
  artwork_files: [{ preview: ART }],
  quote: { line_items: [{ product_image: PNG }] },
};

describe("order inline product images", () => {
  it("uses a content-addressed storage path", async () => {
    const a = await buildOrderImageStoragePath(PNG);
    const b = await buildOrderImageStoragePath(PNG);
    expect(a?.path).toMatch(/^order-images\/[0-9a-f]{64}\.png$/);
    expect(a?.path).toBe(b?.path);
    expect((await buildOrderImageStoragePath(JPG))?.path).toMatch(/\.jpg$/);
  });

  it("only collects product image keys, never artwork", () => {
    const found = collectInlineProductImages(order);
    expect([...found].sort()).toEqual([PNG, JPG].sort());
  });

  it("uploads each distinct image once and swaps in URLs", async () => {
    const { client, uploads } = fakeClient();
    const result: any = await externalizeOrderProductImages(order, client);
    expect(uploads).toHaveLength(2);
    expect(result.product_image).toMatch(/^https:\/\/cdn\.test\/order-images\//);
    expect(result.line_items[0].product_image).toBe(result.product_image);
    expect(result.quote.line_items[0].product_image).toBe(result.product_image);
    expect(result.artwork_files[0].preview).toBe(ART);
    expect(JSON.stringify(result)).not.toContain("fake-png");
  });

  it("treats an existing object as success", async () => {
    const { client } = fakeClient({ existing: true });
    const result: any = await externalizeOrderProductImages(order, client);
    expect(result.product_image).toMatch(/^https:/);
  });

  it("drops inline images when upload is not allowed instead of failing the save", async () => {
    const { client } = fakeClient({ failUpload: true });
    const onError = vi.fn();
    const result: any = await externalizeOrderProductImages(order, client, { onError });
    expect(result.product_image).toBe("");
    expect(result.line_items[1].product_image).toBe("");
    expect(onError).toHaveBeenCalled();
  });

  it("never writes inline product images to any order column", () => {
    const payload = buildSupabaseOrderPayload({ ...order, quote: { ...order.quote } });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("fake-png");
    expect(text).not.toContain("fake-jpg");
  });
});

describe("changed-fields-only order updates", () => {
  const base = {
    order_number: "TC-2",
    status: "New",
    notes: "a",
    line_items: [{ product_image: "https://cdn.test/x.png", quantity: 2 }],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };

  it("sends only changed columns plus audit fields", () => {
    const patch = buildSupabaseOrderUpdatePatch(base, {
      ...base,
      artwork_approval_status: "Approved",
      updated_at: "2026-10-20T00:00:00.000Z",
    });
    expect(patch.artwork_approval_status).toBe("Approved");
    expect(patch.updated_at).toBe("2026-10-20T00:00:00.000Z");
    expect(patch).not.toHaveProperty("line_items");
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("created_at");
    expect(patch).toHaveProperty("quote");
  });

  it("sends the full payload when there is no previous order", () => {
    const patch = buildSupabaseOrderUpdatePatch(null, base);
    expect(patch).toHaveProperty("line_items");
  });
});

describe("garment photo sources", () => {
  it("prefers the first persistable source and skips inline/blob values", async () => {
    const { pickPersistableImageSource } = await import("./orderImageStorage");
    expect(pickPersistableImageSource(PNG, "blob:x", "https://cdn.test/g.png", "https://cdn.test/p.png")).toBe("https://cdn.test/g.png");
    expect(pickPersistableImageSource("", "https://cdn.test/p.png")).toBe("https://cdn.test/p.png");
    expect(pickPersistableImageSource(PNG)).toBe("");
  });

  it("uploads garment photos under garment-images and keeps inline on failure", async () => {
    const { externalizeGarmentImage } = await import("./garmentLibraryStore");
    const ok = fakeClient();
    const url = await externalizeGarmentImage(PNG, ok.client);
    expect(url).toMatch(/^https:\/\/cdn\.test\/garment-images\/[0-9a-f]{64}\.png$/);
    expect(await externalizeGarmentImage("https://cdn.test/already.png", ok.client)).toBe("https://cdn.test/already.png");
    const bad = fakeClient({ failUpload: true });
    expect(await externalizeGarmentImage(PNG, bad.client)).toBe(PNG);
  });
});
