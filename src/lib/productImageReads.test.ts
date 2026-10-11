import { describe, expect, it, vi } from "vitest";
import { hydrateLegacyProductImages, resolveStorageProductImages } from "./productImageReads";

describe("legacy product image reads", () => {
  it("restores images without including them in the large metadata response", async () => {
    let active = 0;
    let maxActive = 0;
    const batches: string[][] = [];
    const client = { from: vi.fn((table) => {
      expect(table).toBe("products");
      return { select: (fields) => {
        expect(fields).toBe("id, image");
        return { in: async (column, ids) => {
          expect(column).toBe("id");
          batches.push(ids);
          maxActive = Math.max(maxActive, ++active);
          await Promise.resolve();
          active--;
          return { data: ids.map((id) => ({ id, image: `data:image/png;base64,${id}` })), error: null };
        } };
      } };
    }) };
    const rows = Array.from({ length: 17 }, (_, id) => ({ id: String(id), name: `Garment ${id}` }));
    const result = await hydrateLegacyProductImages(client, rows);
    expect(result.every((row) => row.image.startsWith("data:image/png"))).toBe(true);
    expect(result.map((row) => row.name)).toEqual(rows.map((row) => row.name));
    expect(batches.map((ids) => ids.length)).toEqual([4, 4, 4, 4, 1]);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(rows[0]).not.toHaveProperty("image");
  });

  it("publishes each completed image group without changing product identities", async () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ id: String(i), name: `Garment ${i}` }));
    const snapshots: Array<Array<{ id: string; name: string; image?: string }>> = [];
    const client = {
      from: () => ({
        select: () => ({
          in: async (_column: string, ids: string[]) => ({
            data: ids.map((id) => ({ id, image: `image-for-${id}` })),
            error: null,
          }),
        }),
      }),
    };
    const finalRows = await hydrateLegacyProductImages(client, rows, () => {}, (snapshot) => {
      snapshots.push(snapshot);
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].filter((row) => row.image)).toHaveLength(12);
    expect(snapshots[1].filter((row) => row.image)).toHaveLength(17);
    for (const snapshot of [...snapshots, finalRows]) {
      expect(snapshot.map((row) => row.name)).toEqual(rows.map((row) => row.name));
      expect(snapshot.every((row) => !row.image || row.image === `image-for-${row.id}`)).toBe(true);
    }
  });

  it("leaves Storage images and existing inline images alone", async () => {
    const client = { from: vi.fn() };
    const rows = [{ id: "storage", image_storage_path: "photo.png" }, { id: "inline", image: "data:image/png;base64,abc" }];
    expect(await hydrateLegacyProductImages(client, rows)).toEqual(rows);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("keeps the catalog usable when an image read fails", async () => {
    const error = { message: "network failure" };
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: null, error }) }) }) };
    const onError = vi.fn();
    const rows = [{ id: "one", unit_price: 50 }];
    expect(await hydrateLegacyProductImages(client, rows, onError)).toEqual(rows);
    expect(onError).toHaveBeenCalledWith(error, ["one"]);
  });
});


describe("Storage image metadata", () => {
  it("resolves original and thumbnail paths and replaces stale inline cache", () => {
    const client = { storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }) }) } };
    const row = resolveStorageProductImages(client, { id: "one", image: "data:image/png;base64,old", image_storage_path: "original.png", image_thumb_storage_path: "thumb.webp" });
    expect(row.image).toBe("https://example.test/original.png");
    expect(row.image_original_url).toBe(row.image);
    expect(row.image_thumb_url).toBe("https://example.test/thumb.webp");
    expect(row.id).toBe("one");
  });
  it("preserves legacy images when Storage is absent", () => {
    const product = { image: "data:image/png;base64,original" };
    expect(resolveStorageProductImages(null, product)).toBe(product);
  });
});
