import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { Dashboard } from "../../lib/extended-types";
import { Button, ErrorState, Loading } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ACTION_LABELS, ENTITY_LABELS } from "./ActivityPage";
import { ActivityChart } from "./Charts";
import {
  categoryShares,
  dashboardCsv,
  monthlyPaths,
  percentChange,
} from "../../lib/admin-dashboard";

const number = (value: number) => value.toLocaleString("vi-VN");
const ago = (value: string) => {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes || 1} phút`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ`;
  return `${Math.round(minutes / 1440)} ngày`;
};
function download(text: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `findit-tong-quan-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MonthlyChart({
  rows,
}: {
  rows: NonNullable<Dashboard["monthlyItems"]>;
}) {
  const chart = monthlyPaths(rows, 640, 220);
  return (
    <figure className="admin-line-chart">
      <svg
        viewBox="0 0 640 250"
        role="img"
        aria-label={`Bài đăng 12 tháng gần nhất. ${rows.map((row) => `${row.month}: ${row.lost} bị mất, ${row.found} nhặt được`).join("; ")}`}
      >
        <defs>
          <linearGradient id="lost-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f04438" stopOpacity=".18" />
            <stop offset="1" stopColor="#f04438" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="found-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#12b76a" stopOpacity=".18" />
            <stop offset="1" stopColor="#12b76a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.grid.map((y) => (
          <line key={y} x1="0" x2="640" y1={y} y2={y} className="grid" />
        ))}
        <path d={chart.lostArea} fill="url(#lost-fill)" />
        <path d={chart.foundArea} fill="url(#found-fill)" />
        <path d={chart.lost} className="line lost" />
        <path d={chart.found} className="line found" />
        {chart.labels.map((label) => (
          <text key={label.x} x={label.x} y="245" textAnchor="middle">
            {label.text}
          </text>
        ))}
      </svg>
      <figcaption className="sr-only">
        Số tin Bị mất và Nhặt được theo tháng
      </figcaption>
    </figure>
  );
}

function CategoryDonut({ rows }: { rows: Dashboard["categories"] }) {
  const shares = categoryShares(rows);
  if (!shares.total) return <p className="muted">Chưa có bài đăng.</p>;
  return (
    <div className="admin-category">
      <div
        className="admin-ring"
        style={{ background: shares.background }}
        role="img"
        aria-label={shares.rows
          .map((row) => `${row.label} ${row.percent}%`)
          .join(", ")}
      >
        <span>
          <strong>{number(shares.total)}</strong>
          <small>bài đăng</small>
        </span>
      </div>
      <ul>
        {shares.rows.map((row) => (
          <li key={row.label}>
            <i style={{ background: row.color }} />
            {row.label}
            <strong>{row.percent}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const days = ["7", "90"].includes(params.get("khoang") || "")
    ? params.get("khoang")!
    : "30";
  const result = useResource<Dashboard>("/admin/dashboard", { days });
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const data = result.data?.data;
  if (!data) return null;
  const growth = data.growth;
  const queue = data.queue;
  const itemsChange = growth
    ? percentChange(growth.newItems30, growth.newItemsPrevious30)
    : null;
  const kpis = [
    {
      icon: "box",
      tone: "blue",
      value: data.items.total,
      label: "Tổng bài đăng",
      sub:
        itemsChange === null
          ? `${number(growth?.newItems30 ?? 0)} bài trong ${days} ngày`
          : `${itemsChange >= 0 ? "+" : ""}${itemsChange}% so với ${days} ngày trước`,
      to: "/quan-tri/bai-dang",
    },
    {
      icon: "smile",
      tone: "green",
      value: data.items.returned,
      label: "Đồ đã trao lại",
      sub: `+${number(growth?.returned30 ?? 0)} trong ${days} ngày`,
      to: "/quan-tri/bai-dang?status=RETURNED",
    },
    {
      icon: "users",
      tone: "violet",
      value: data.users.total,
      label: "Người dùng",
      sub: `+${number(growth?.newUsers30 ?? 0)} người mới`,
      to: "/quan-tri/nguoi-dung",
    },
    {
      icon: "flag",
      tone: "red",
      value: queue?.reports ?? data.reports.byStatus.PENDING,
      label: "Báo cáo chờ xử lý",
      sub: queue?.overdueReports
        ? `${queue.overdueReports} quá 24 giờ`
        : "Không có báo cáo quá hạn",
      to: "/quan-tri/bao-cao?status=PENDING",
    },
  ] as const;
  const queueRows = [
    {
      icon: "flag",
      tone: "red",
      label: "Báo cáo vi phạm",
      sub: queue?.overdueReports
        ? `${queue.overdueReports} báo cáo quá 24 giờ`
        : "Chờ xem xét hoặc đang xem xét",
      count: queue?.reports ?? 0,
      to: "/quan-tri/bao-cao?status=PENDING",
    },
    {
      icon: "shield",
      tone: "amber",
      label: "Khiếu nại bàn giao",
      sub: "Cần quản trị viên phân xử",
      count: queue?.disputes ?? 0,
      to: "/quan-tri/khieu-nai",
    },
    {
      icon: "message",
      tone: "blue",
      label: "Hộp thư liên hệ",
      sub: "Chưa phản hồi",
      count: queue?.contacts ?? 0,
      to: "/quan-tri/lien-he",
    },
  ] as const;
  return (
    <div className="admin-dashboard">
      <header className="admin-dash-head">
        <div>
          <h1>Tổng quan hệ thống</h1>
          <p>
            Cập nhật lúc{" "}
            {new Date().toLocaleString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="actions">
          <label className="admin-range">
            <span className="sr-only">Khoảng thời gian</span>
            <select
              value={days}
              onChange={(e) =>
                setParams(
                  e.target.value === "30" ? {} : { khoang: e.target.value },
                )
              }
            >
              <option value="7">7 ngày qua</option>
              <option value="30">30 ngày qua</option>
              <option value="90">90 ngày qua</option>
            </select>
          </label>
          <Button variant="secondary" onClick={invalidate}>
            <Icon name="refresh" /> Làm mới
          </Button>
          <Button onClick={() => download(dashboardCsv(data))}>
            <Icon name="download" /> Xuất CSV
          </Button>
        </div>
      </header>
      <div className="admin-kpis">
        {kpis.map((kpi) => (
          <Link key={kpi.label} className="admin-kpi" to={kpi.to}>
            <span className={`admin-kpi-icon ${kpi.tone}`}>
              <Icon name={kpi.icon} />
            </span>
            <strong>{number(kpi.value)}</strong>
            <span>{kpi.label}</span>
            <small>{kpi.sub}</small>
          </Link>
        ))}
      </div>
      <div className="admin-dash-row">
        <section className="admin-card" aria-labelledby="monthly-title">
          <div className="admin-card-head">
            <h2 id="monthly-title">Bài đăng theo tháng</h2>
            <span className="admin-legend">
              <i className="lost" /> Bị mất <i className="found" /> Nhặt được
            </span>
          </div>
          <MonthlyChart rows={data.monthlyItems ?? []} />
        </section>
        <section className="admin-card" aria-labelledby="queue-title">
          <h2 id="queue-title">Hàng đợi cần xử lý</h2>
          <div className="admin-queue-list">
            {queueRows.map((row) => (
              <Link
                key={row.label}
                to={row.to}
                className={row.count ? "" : "is-clear"}
              >
                <span className={`admin-kpi-icon ${row.tone}`}>
                  <Icon name={row.icon} />
                </span>
                <span>
                  <strong>{row.label}</strong>
                  <small>
                    {row.count ? row.sub : "Không còn việc tồn đọng"}
                  </small>
                </span>
                <b className={row.tone}>{row.count}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <div className="admin-dash-row reverse">
        <section className="admin-card" aria-labelledby="category-title">
          <h2 id="category-title">Theo danh mục</h2>
          <CategoryDonut rows={data.categories} />
        </section>
        <section className="admin-card" aria-labelledby="recent-title">
          <div className="admin-card-head">
            <h2 id="recent-title">Hoạt động gần đây</h2>
            <Link className="link-more" to="/quan-tri/nhat-ky">
              Xem nhật ký
            </Link>
          </div>
          {data.recentLogs?.length ? (
            <ul className="admin-recent">
              {data.recentLogs.map((log) => (
                <li key={log.id}>
                  <span className="avatar">
                    {(log.actorName || "H").slice(0, 1)}
                  </span>
                  <p>
                    <strong>{log.actorName || "Hệ thống"}</strong>{" "}
                    {(
                      ACTION_LABELS[log.action] || log.action
                    ).toLocaleLowerCase("vi")}
                    {log.entityId
                      ? ` · ${ENTITY_LABELS[log.entityType] || log.entityType} #${log.entityId}`
                      : ""}
                  </p>
                  <time dateTime={log.createdAt}>{ago(log.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Chưa có hoạt động.</p>
          )}
        </section>
      </div>
      <section className="admin-card" aria-labelledby="activity-title">
        <h2 id="activity-title">Số thao tác {days} ngày gần đây</h2>
        <ActivityChart rows={data.recentActivity} />
      </section>
    </div>
  );
}
