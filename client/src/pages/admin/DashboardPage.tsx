import { Link } from "react-router-dom";
import { statusLabel } from "../../lib/display-labels";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { Dashboard, Report } from "../../lib/extended-types";
import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  StatusBadge,
} from "../../components/ui";
import { Icon } from "../../components/Icon";
import { AdminTitle } from "./shared";
import { ActivityChart, CategoryChart, DistributionChart } from "./Charts";
export function DashboardPage() {
  const result = useResource<Dashboard>("/admin/dashboard");
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const data = result.data?.data;
  if (!data) return null;
  return (
    <>
      <AdminTitle title="Tổng quan">
        <Button variant="secondary" onClick={invalidate}>
          <Icon name="refresh" />
          Làm mới
        </Button>
      </AdminTitle>
      <section className="admin-queue" aria-label="Hàng đợi công việc">
        <strong>
          <Icon name="alert" />
          Cần xử lý
        </strong>
        <Link to="/quan-tri/bao-cao?status=PENDING">
          {data.reports.byStatus.PENDING} báo cáo chờ xem xét{" "}
          <Icon name="arrow" />
        </Link>
        <Link to="/quan-tri/bao-cao?status=REVIEWING">
          {data.reports.byStatus.REVIEWING} báo cáo đang xem xét{" "}
          <Icon name="arrow" />
        </Link>
        <Link to="/quan-tri/claims?status=PENDING">
          {data.claims.byStatus.PENDING} yêu cầu nhận đồ đang chờ{" "}
          <Icon name="arrow" />
        </Link>
      </section>
      <div className="stat-grid admin-primary-stats">
        {(
          [
            ["Người dùng", data.users.total, "users"],
            ["Bài đăng", data.items.total, "list"],
            ["Yêu cầu nhận đồ", data.claims.total, "shield"],
            ["Đồ đã trao lại", data.items.returned, "box"],
          ] as const
        ).map(([label, value, icon]) => (
          <article className="panel stat-card" key={label}>
            <span className="admin-stat-icon">
              <Icon name={icon} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value.toLocaleString("vi-VN")}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="admin-dashboard-charts">
        <section className="panel admin-activity-panel">
          <h2>Số thao tác trong 30 ngày gần đây</h2>
          <ActivityChart rows={data.recentActivity} />
        </section>
        <section className="panel">
          <h2>Trạng thái bài đăng</h2>
          <DistributionChart
            rows={Object.entries(data.items.byStatus).map(([key, count]) => ({
              label: statusLabel(key, "item"),
              count,
            }))}
          />
        </section>
        <section className="panel">
          <h2>20 danh mục có nhiều bài đăng nhất</h2>
          <CategoryChart rows={data.categories} />
        </section>
        <PendingReports />
      </div>
      <div className="admin-secondary-stats">
        <span>
          Gợi ý đồ vật <strong>{data.matches.total}</strong>
        </span>
        <span>
          Tổng báo cáo <strong>{data.reports.total}</strong>
        </span>
        <span>
          Tài khoản hoạt động <strong>{data.users.active}</strong>
        </span>
        <span>
          Tài khoản đình chỉ <strong>{data.users.suspended}</strong>
        </span>
        <span>
          Đồ bị mất <strong>{data.items.lost}</strong>
        </span>
        <span>
          Đồ nhặt được <strong>{data.items.found}</strong>
        </span>
      </div>
      <div className="dashboard-grid">
        {(
          [
            ["Trạng thái yêu cầu nhận đồ", data.claims.byStatus, "claim"],
            ["Trạng thái báo cáo", data.reports.byStatus, "report"],
          ] as const
        ).map(([title, statuses, group]) => (
          <section className="panel" key={title}>
            <h2>{title}</h2>
            <dl className="summary-list">
              {Object.entries(statuses).map(([key, count]) => (
                <div key={key}>
                  <dt>{statusLabel(key, group)}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
function PendingReports() {
  const reports = useResource<Report[]>("/admin/reports", {
    status: "PENDING",
    page: 1,
    limit: 4,
  });
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Báo cáo chờ xem xét</h2>
        <Link className="text-link" to="/quan-tri/bao-cao?status=PENDING">
          Xem tất cả →
        </Link>
      </div>
      {reports.loading ? (
        <Loading />
      ) : reports.error ? (
        <ErrorState error={reports.error} retry={invalidate} />
      ) : reports.data?.data.length ? (
        <ul className="admin-report-preview">
          {reports.data.data.map((report) => (
            <li key={report.id}>
              <StatusBadge status={report.status} group="report" />
              <div>
                <strong>#{report.id}</strong>
                <p>{report.reason}</p>
              </div>
              <Link
                to={`/quan-tri/bao-cao/${report.id}?status=PENDING`}
                aria-label={`Xem xét báo cáo #${report.id}`}
              >
                Xem xét →
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Không có báo cáo đang chờ" />
      )}
    </section>
  );
}
