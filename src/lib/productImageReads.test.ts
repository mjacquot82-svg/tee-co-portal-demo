import { describe, expect, it, vi } from "vitest";
import { hydrateLegacyProductImages } from "./productImageReads";

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
