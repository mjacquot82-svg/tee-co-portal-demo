import { describe, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ARTWORK_RESELECT_MESSAGE, readArtworkBytes, selectOrderArtwork, uploadArtworkFile } from "./customerArtworkUpload";

describe("customer artwork upload recovery", () => {
  test("reads real browser File bytes, including the FileReader fallback", async () => {
    expect(Array.from(await readArtworkBytes(new File(["logo"], "logo.png", { type: "image/png" })))).toEqual([108, 111, 103, 111]);
  });

  test.each([
    { name: "empty.png", size: 0 },
    { name: "lost.png" },
    { name: "lost.png", size: 4, arrayBuffer: async () => { throw new Error("Unavailable"); } },
    { name: "empty.png", size: 4, arrayBuffer: async () => new ArrayBuffer(0) },
    { name: "partial.png", size: 4, arrayBuffer: async () => new ArrayBuffer(2) },
  ])("rejects unreadable or incomplete artwork before any upload: $name", async (file) => {
    const upload = vi.fn();
    await expect(uploadArtworkFile({ upload }, "customer/logo.png", file)).rejects.toThrow(ARTWORK_RESELECT_MESSAGE);
    expect(upload).not.toHaveBeenCalled();
  });

  test("actual Supabase SDK sends binary bytes and a nonempty content type without multipart", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ Key: "customer-artwork/customer/logo.png" }), { status: 200 }));
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
    });
    await uploadArtworkFile(client.storage.from("customer-artwork"), "customer/logo.png", new File(["logo"], "logo.png"));
    const [, request] = fetcher.mock.calls[0];
    if (!request) throw new Error("Expected an upload request");
    expect(Array.from(request.body as Uint8Array)).toEqual([108, 111, 103, 111]);
    expect(new Headers(request.headers).get("content-type")).toBe("application/octet-stream");
    expect(new Headers(request.headers).get("x-upsert")).toBe("false");
  });

  test("offers reselect recovery for missing content without retrying or hiding other errors", async () => {
    const file = new File(["logo"], "logo.png", { type: "image/png" });
    const upload = vi.fn().mockResolvedValueOnce({ error: { message: "No content provided" } })
      .mockResolvedValueOnce({ error: null });
    await expect(uploadArtworkFile({ upload }, "customer/logo.png", file)).rejects.toThrow(ARTWORK_RESELECT_MESSAGE);
    expect(upload).toHaveBeenCalledTimes(1);
    await expect(uploadArtworkFile({ upload }, "customer/logo.png", file)).resolves.toBeUndefined();
    upload.mockResolvedValueOnce({ error: { message: "Permission denied" } });
    await expect(uploadArtworkFile({ upload }, "customer/logo.png", file)).rejects.toThrow("Permission denied");
  });
});


test("reselection excludes an unreadable old file but retains artwork used by other lines", async () => {
  const library = [{ id: "old" }, { id: "replacement" }, { id: "shared" }, { id: "placement" }];
  const selected = selectOrderArtwork(library, [
    { artwork_id: "replacement" },
    { artwork_id: "shared", placements: [{ artwork_id: "placement" }] },
    { artwork_id: "shared" },
  ]);
  expect(selected.map((asset: { id: string }) => asset.id)).toEqual(["replacement", "shared", "placement"]);
  const files = new Map([
    ["old", new File([], "old.png")],
    ["replacement", new File(["fresh"], "logo.png")],
  ]);
  const upload = vi.fn().mockResolvedValue({ error: null });
  for (const asset of selected) {
    const file = files.get(asset.id);
    if (file) await uploadArtworkFile({ upload }, `customer/${asset.id}.png`, file);
  }
  expect(upload).toHaveBeenCalledTimes(1);
  expect(Array.from(upload.mock.calls[0][1])).toEqual([102, 114, 101, 115, 104]);
});


test("legacy library-only and name-based artwork is not silently discarded", () => {
  const legacy = { id: "legacy-artwork", displayName: "old-logo.png" };
  const current = { id: "current", displayName: "new-logo.png" };
  expect(selectOrderArtwork([legacy], [{ artwork_id: "", artwork_name: "old-logo.png" }])).toEqual([legacy]);
  expect(selectOrderArtwork([legacy], [{ artwork_id: "" }])).toEqual([legacy]);
  expect(selectOrderArtwork([legacy, current], [
    { artwork_id: "current" }, { artwork_id: "", artwork_name: "old-logo.png" },
  ])).toEqual([legacy, current]);
});
