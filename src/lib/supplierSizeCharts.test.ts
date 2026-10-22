import { describe, expect, it } from "vitest";
import { buildStyleKey, mapSsSpecsToSizeCharts } from "./supplierColorPhotos";

describe("S&S size charts", () => {
  it("groups specs by style, orders sizes and drops tolerances", () => {
    const rows = [
      { brandName: "Gildan", styleName: "5000L", styleID: 1, sizeName: "M", sizeOrder: "B3", specName: "Body Length", value: "26" },
      { brandName: "Gildan", styleName: "5000L", styleID: 1, sizeName: "S", sizeOrder: "B2", specName: "Body Length", value: "25 1/2" },
      { brandName: "Gildan", styleName: "5000L", styleID: 1, sizeName: "S", sizeOrder: "B2", specName: "Chest Width (Laid Flat)", value: "17 1/4" },
      { brandName: "Gildan", styleName: "5000L", styleID: 1, sizeName: "S", sizeOrder: "B2", specName: "Body Length Tolerance", value: "-/+ 1" },
    ];
    const [chart] = mapSsSpecsToSizeCharts(rows);
    expect(chart.style_key).toBe("gildan|5000l");
    expect(chart.sizes).toEqual(["S", "M"]);
    expect(chart.measurements.map((m) => m.name)).toEqual(["Chest Width (Laid Flat)", "Body Length"]);
    expect(chart.measurements[1].values).toEqual({ S: "25 1/2", M: "26" });
  });

  it("matches brand spellings between S&S and the Tee & Co catalogue", () => {
    expect(buildStyleKey("CORE365", "CE111")).toBe(buildStyleKey("Core 365", "CE111"));
    expect(buildStyleKey("BELLA + CANVAS", "3001")).toBe(buildStyleKey("Bella + Canvas", "3001"));
    expect(buildStyleKey("Rabbit Skin", "3326")).toBe(buildStyleKey("Rabbit Skins", "3326"));
  });
});
