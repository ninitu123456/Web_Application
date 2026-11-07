import { describe, expect, it } from "vitest";
import { barScale, distribution } from "./admin-charts";
describe("admin aggregate chart data", () => {
  it("uses actual state counts for the donut total and segment proportions", () => {
    const chart = distribution([
      { label: "Đang mở", count: 3 },
      { label: "Đã đóng", count: 1 },
      { label: "Đã trao lại", count: 0 },
    ]);
    expect(chart.total).toBe(4);
    expect(chart.background).toContain("0% 75%");
    expect(chart.background).toContain("75% 100%");
    expect(chart.background).not.toMatch(/NaN|Infinity/);
  });
  it("renders an explicit zero total without dividing by zero", () => {
    expect(distribution([])).toEqual({ total: 0, background: "#e6eae3" });
    expect(distribution([{ label: "Chờ", count: 0 }])).toEqual({
      total: 0,
      background: "#e6eae3",
    });
    expect(barScale([])).toBe(1);
    expect(barScale([0, 0])).toBe(1);
  });
  it("scales sparse daily counts without inventing missing days or a date range", () => {
    const counts = [2, 19, 0, 5];
    expect(barScale(counts)).toBe(19);
    expect(counts).toEqual([2, 19, 0, 5]);
  });
});
