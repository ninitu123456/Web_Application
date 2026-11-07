import { useId } from "react";
import { barScale, chartColors, distribution } from "../../lib/admin-charts";
import { EmptyState } from "../../components/ui";
import { Table } from "./shared";

export function DistributionChart({
  rows,
}: {
  rows: { label: string; count: number }[];
}) {
  const chart = distribution(rows);
  return (
    <div className="admin-distribution">
      <div
        className="admin-donut"
        style={{ background: chart.background }}
        role="img"
        aria-label={`Tổng ${chart.total} bài đăng. ${rows.map((row) => `${row.label}: ${row.count}`).join("; ")}`}
      >
        <div>
          <span>Tổng bài đăng</span>
          <strong>{chart.total.toLocaleString("vi-VN")}</strong>
        </div>
      </div>
      <dl className="admin-chart-legend">
        {rows.map((row, index) => (
          <div key={row.label}>
            <dt>
              <i
                style={{ background: chartColors[index % chartColors.length] }}
              />
              {row.label}
            </dt>
            <dd>{row.count.toLocaleString("vi-VN")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
export function ActivityChart({
  rows,
}: {
  rows: { date: string; count: number }[];
}) {
  const id = useId();
  const max = barScale(rows.map((row) => row.count));
  if (!rows.length)
    return <EmptyState title="Chưa có hoạt động trong khoảng dữ liệu này" />;
  return (
    <>
      <div
        className="admin-column-chart"
        role="group"
        aria-label="Biểu đồ số thao tác theo ngày"
        aria-describedby={id}
      >
        <div className="admin-chart-axis" aria-hidden="true">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="admin-columns">
          {rows.map((row, index) => (
            <div className="admin-column" key={row.date}>
              <button
                type="button"
                className="admin-chart-point"
                aria-label={`${row.date}: ${row.count} thao tác`}
                data-tooltip={`${row.date}: ${row.count} thao tác`}
                style={{ height: `${(row.count / max) * 100}%` }}
              />
              <span>
                {index % Math.max(1, Math.ceil(rows.length / 6)) === 0 ||
                index === rows.length - 1
                  ? row.date.slice(5).split("-").reverse().join("/")
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p id={id} className="admin-chart-note">
        Ngày theo UTC; chỉ hiển thị ngày có dữ liệu.
      </p>
      <details className="admin-data-table">
        <summary>Xem bảng số liệu</summary>
        <Table columns={["Ngày (UTC)", "Số thao tác"]}>
          {rows.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </Table>
      </details>
    </>
  );
}
export function CategoryChart({
  rows,
}: {
  rows: { id: number; name: string; count: number }[];
}) {
  const max = barScale(rows.map((row) => row.count));
  if (!rows.length) return <EmptyState title="Chưa có dữ liệu danh mục" />;
  return (
    <div
      className="admin-horizontal-bars"
      role="list"
      aria-label="Số bài đăng theo danh mục"
    >
      {rows.map((row) => (
        <div role="listitem" key={row.id}>
          <span>{row.name}</span>
          <div>
            <span
              tabIndex={0}
              role="img"
              aria-label={`${row.name}: ${row.count} bài đăng`}
              data-tooltip={`${row.count} bài đăng`}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}
