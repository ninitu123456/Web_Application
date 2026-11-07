export const chartColors = [
  "#206448",
  "#a8cda0",
  "#f0c66c",
  "#76a98c",
  "#d4d9d4",
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
    background: total ? `conic-gradient(${stops.join(",")})` : "#e6eae3",
  };
}
export function barScale(values: number[]) {
  return Math.max(1, ...values);
}
