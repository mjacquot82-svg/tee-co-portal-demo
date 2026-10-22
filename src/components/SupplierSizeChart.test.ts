import { describe, expect, it } from "vitest";
import { sizeChartSourceNote } from "./SupplierSizeChart";

describe("sizeChartSourceNote", () => {
  it("credits S&S only for S&S charts", () => {
    expect(sizeChartSourceNote({ supplier: "ss_activewear" })).toMatch(/S&S Activewear/);
    expect(sizeChartSourceNote({ supplier: "tee_co_supplied", brand_name: "CX2" })).toBe("Measurements from the CX2 size chart, in inches.");
    expect(sizeChartSourceNote({ supplier: "tee_co_supplied" })).not.toMatch(/S&S/);
  });
});
