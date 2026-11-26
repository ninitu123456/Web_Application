import { describe, expect, it } from "vitest";
import {
  categoryShares,
  dashboardCsv,
  monthlyPaths,
  percentChange,
} from "./admin-dashboard";

describe("admin dashboard helpers", () => {
  it("computes change against the previous window", () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(5, 0)).toBeNull();
  });
  it("groups categories beyond the top four into Khác", () => {
    const shares = categoryShares([
      { name: "A", count: 5 },
      { name: "B", count: 2 },
      { name: "C", count: 1 },
      { name: "D", count: 1 },
      { name: "E", count: 1 },
      { name: "F", count: 0 },
    ]);
    expect(shares.total).toBe(10);
    expect(shares.rows.map((row) => row.label)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "Khác",
    ]);
    expect(shares.rows[0].percent).toBe(50);
  });
  it("draws one point per month with month labels", () => {
    const chart = monthlyPaths(
      [
        { month: "2026-10", lost: 1, found: 2 },
        { month: "2026-11", lost: 3, found: 0 },
      ],
      100,
      50,
    );
    expect(chart.labels.map((label) => label.text)).toEqual(["T10", "T11"]);
    expect(chart.lost.startsWith("M0.0,")).toBe(true);
  });
  it("escapes CSV cells and neutralises formulas", () => {
    const csv = dashboardCsv({
      users: { total: 1, active: 1, suspended: 0 },
      items: { total: 0, lost: 0, found: 0, returned: 0 },
      claims: { total: 0 },
      reports: { total: 0 },
      categories: [{ name: '=HYPERLINK("x")', count: 1 }],
    });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
