import { chartColors } from "./admin-charts";

export function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type Month = { month: string; lost: number; found: number };
/** Smooth line and area paths for the monthly Lost/Found chart. */
export function monthlyPaths(rows: Month[], width: number, height: number) {
  const max = Math.max(4, ...rows.flatMap((row) => [row.lost, row.found]));
  const top = 10;
  const step = rows.length > 1 ? width / (rows.length - 1) : width;
  const point = (value: number, index: number) =>
    [index * step, top + (height - top) * (1 - value / max)] as const;
  const line = (key: "lost" | "found") => {
    const points = rows.map((row, index) => point(row[key], index));
    if (!points.length) return "";
    return points
      .map(([x, y], index) => {
        if (!index) return `M${x.toFixed(1)},${y.toFixed(1)}`;
        const [px, py] = points[index - 1];
        const cx = (px + x) / 2;
        return `C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  const area = (path: string) =>
    path ? `${path} L${width},${height} L0,${height} Z` : "";
  const lost = line("lost"),
    found = line("found");
  return {
    lost,
    found,
    lostArea: area(lost),
    foundArea: area(found),
    grid: [0.25, 0.5, 0.75, 1].map((ratio) => top + (height - top) * ratio),
    labels: rows.map((row, index) => ({
      x: index * step,
      text: `T${Number(row.month.slice(5))}`,
    })),
  };
}

/** Top four categories plus "Khác", as rounded percentages. */
export function categoryShares(rows: { name: string; count: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const sorted = [...rows]
    .sort((a, b) => b.count - a.count)
    .filter((row) => row.count > 0);
  const head = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((sum, row) => sum + row.count, 0);
  const parts = [
    ...head.map((row) => ({ label: row.name, count: row.count })),
    ...(rest ? [{ label: "Khác", count: rest }] : []),
  ];
  let start = 0;
  const stops: string[] = [];
  const result = parts.map((part, index) => {
    const color =
      part.label === "Khác"
        ? "#c3cee2"
        : chartColors[index % chartColors.length];
    const share = total ? (part.count / total) * 100 : 0;
    stops.push(`${color} ${start.toFixed(2)}% ${(start + share).toFixed(2)}%`);
    start += share;
    return { ...part, color, percent: Math.round(share) };
  });
  return {
    total,
    rows: result,
    background: total ? `conic-gradient(${stops.join(", ")})` : "#e6ecf8",
  };
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function dashboardCsv(data: {
  users: { total: number; active: number; suspended: number };
  items: { total: number; lost: number; found: number; returned: number };
  claims: { total: number };
  reports: { total: number };
  categories: { name: string; count: number }[];
  monthlyItems?: Month[];
}) {
  const rows: (string | number)[][] = [
    ["Chỉ số", "Giá trị"],
    ["Người dùng", data.users.total],
    ["Tài khoản hoạt động", data.users.active],
    ["Tài khoản bị đình chỉ", data.users.suspended],
    ["Tổng bài đăng", data.items.total],
    ["Tin bị mất", data.items.lost],
    ["Tin nhặt được", data.items.found],
    ["Đồ đã trao lại", data.items.returned],
    ["Yêu cầu nhận đồ", data.claims.total],
    ["Báo cáo vi phạm", data.reports.total],
    [],
    ["Danh mục", "Số bài"],
    ...data.categories.map((row) => [row.name, row.count]),
    [],
    ["Tháng", "Bị mất", "Nhặt được"],
    ...(data.monthlyItems ?? []).map((row) => [row.month, row.lost, row.found]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
