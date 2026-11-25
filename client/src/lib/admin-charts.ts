export const chartColors = [
  "#1d6bff",
  "#f79009",
  "#7a5af8",
  "#12b76a",
  "#c3cee2",
];
export function distribution(rows: { label: string; count: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let position = 0;
  const stops = rows.map((row, index) => {
    const start = position;
    position += total ? (row.count / total) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${position}%`;
  });
  return {
    total,
    background: total ? `conic-gradient(${stops.join(",")})` : "#e6ecf8",
  };
}
export function barScale(values: number[]) {
  return Math.max(1, ...values);
}
