import { describe, expect, it } from "vitest";
import { findColorPhotoRecord } from "./supplierColorPhotos";
import { resolveColorAlias } from "./supplierColorAliases";

describe("colour aliases", () => {
  const records = [
    { style_key: "gildan|64000", color_name: "Sport Grey", color_front_image: "a" },
    { style_key: "gildan|64000", color_name: "Black", color_front_image: "b" },
  ];
  it("finds S&S Sport Grey for Tee & Co's Athletic Grey", () => {
    expect(findColorPhotoRecord(records, "Athletic Grey")?.color_name).toBe("Sport Grey");
  });
  it("prefers an exact name and returns null for unknown colours", () => {
    expect(findColorPhotoRecord(records, "Black")?.color_front_image).toBe("b");
    expect(findColorPhotoRecord(records, "Heather Scarlet Red")).toBeNull();
  });
  it("uses per-style aliases only for that style", () => {
    expect(resolveColorAlias("Moss", "ypclassics|6606")).toBe("Moss/ Khaki");
    expect(resolveColorAlias("Moss", "gildan|64000")).toBe("");
  });
});
