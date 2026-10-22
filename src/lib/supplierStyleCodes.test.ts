import { describe, it, expect } from "vitest";
import { resolveSupplierStyle, buildStyleKey } from "./supplierColorPhotos";

describe("Canadian supplier style codes (Tee & Co's own photos)", () => {
  it("reads code-first names", () => {
    const s = resolveSupplierStyle({ brand_model: "24/7 All Day Every Day L00545 - Flux - Adult 1/4 Zip Sweatshirt" });
    expect(s).toEqual({ brand: "24/7 All Day Every Day", style: "L00545" });
    expect(buildStyleKey(s!.brand, s!.style)).toBe("247alldayeveryday|l00545");
    const e = resolveSupplierStyle({ brand_model: "24/7 All Day Everyday S05610 - Parkour - Adult RING SPUN Combed Cotton Crewneck T-Shirt" });
    expect(buildStyleKey(e!.brand, e!.style)).toBe("247alldayeveryday|s05610");
  });
  it("still reads brand + code", () => {
    expect(resolveSupplierStyle({ brand_model: "CX2 L7260Y" })).toEqual({ brand: "CX2", style: "L7260Y" });
    expect(resolveSupplierStyle({ brand_model: "Heritage 54 L02185" })).toEqual({ brand: "Heritage 54", style: "L02185" });
    expect(resolveSupplierStyle({ brand_model: "Team 365 TT62" })).toEqual({ brand: "Team 365", style: "TT62" });
  });
});
