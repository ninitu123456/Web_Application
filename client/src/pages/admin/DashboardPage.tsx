import { statusLabel } from "../../lib/display-labels";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { Dashboard } from "../../lib/extended-types";
import { EmptyState, ErrorState, Loading } from "../../components/ui";
import { AdminTitle, Table } from "./shared";
export function DashboardPage() {
  const result = useResource<Dashboard>("/admin/dashboard");
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const data = result.data?.data;
  if (!data) return null;
  return (
    <>
      <AdminTitle title="Tổng quan" />
      <div className="stat-grid">
        {[
          ["Người dùng", data.users.total],
          ["Bài đăng", data.items.total],
          ["Yêu cầu nhận đồ", data.claims.total],
          ["Gợi ý đồ vật", data.matches.total],
          ["Báo cáo", data.reports.total],
          ["Đồ đã trao lại", data.items.returned],
        ].map(([label, value]) => (
          <article className="panel stat-card" key={label}>
            <span>{label}</span>
            <strong>{Number(value).toLocaleString("vi-VN")}</strong>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Tài khoản & loại bài</h2>
          <dl className="summary-list">
            {[
              ["Tài khoản hoạt động", data.users.active],
              ["Tài khoản đình chỉ", data.users.suspended],
              ["Đồ bị mất", data.items.lost],
              ["Đồ nhặt được", data.items.found],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {[
          ["Trạng thái bài đăng", data.items.byStatus, "item"],
          ["Trạng thái yêu cầu nhận đồ", data.claims.byStatus, "claim"],
          ["Trạng thái báo cáo", data.reports.byStatus, "report"],
        ].map(([title, statuses, group]) => (
          <section className="panel" key={String(title)}>
            <h2>{String(title)}</h2>
            <dl className="summary-list">
              {Object.entries(statuses).map(([status, count]) => (
                <div key={status}>
                  <dt>
                    {statusLabel(status, group as "item" | "claim" | "report")}
                  </dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <section className="panel admin-section">
        <h2>Đồ vật theo danh mục</h2>
        {data.categories.length ? (
          <Table columns={["Danh mục", "Số bài"]}>
            {data.categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.count}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="Chưa có dữ liệu danh mục" />
        )}
      </section>
      <section className="panel admin-section">
        <h2>Hoạt động trong 30 ngày gần đây</h2>
        <p className="muted">
          Số thao tác được ghi nhận mỗi ngày, không phải số lượt truy cập.
        </p>
        {data.recentActivity.length ? (
          <div className="activity-bars" aria-label="Số hoạt động mỗi ngày">
            {data.recentActivity.map((row) => (
              <div key={row.date}>
                <span>{row.date.split("-").reverse().join("/")}</span>
                <meter
                  min={0}
                  max={Math.max(
                    1,
                    ...data.recentActivity.map((value) => value.count),
                  )}
                  value={row.count}
                >
                  {row.count}
                </meter>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Chưa có hoạt động" />
        )}
      </section>
    </>
  );
}
