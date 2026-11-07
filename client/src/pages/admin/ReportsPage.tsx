import { statusLabel } from "../../lib/display-labels";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { Dashboard, Report, ReportStatus } from "../../lib/extended-types";
import type { Item } from "../../lib/types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  ItemImage,
  Pagination,
  Select,
  StatusBadge,
} from "../../components/ui";
import { TargetReference } from "../MyReportsPage";
import {
  AdminTitle,
  MutationError,
  Table,
  useAdminQuery,
  useMutation,
} from "./shared";
export function AdminReportsPage() {
  const { id } = useParams();
  const list = useRef<HTMLElement>(null);
  const previousSelection = useRef(id);
  useEffect(() => {
    if (!id && previousSelection.current) list.current?.focus();
    previousSelection.current = id;
  }, [id]);
  const filters = useAdminQuery(["status"]);
  const result = useResource<Report[]>("/admin/reports", filters.query);
  const summary = useResource<Dashboard>("/admin/dashboard");
  const totals = summary.data?.data.reports;
  return (
    <>
      <AdminTitle title="Báo cáo vi phạm" />
      {totals && (
        <div className="stat-grid admin-report-stats">
          {[
            ["Chờ xem xét", totals.byStatus.PENDING],
            ["Đang xem xét", totals.byStatus.REVIEWING],
            [
              "Đã kết thúc",
              totals.byStatus.RESOLVED + totals.byStatus.DISMISSED,
            ],
          ].map(([label, count]) => (
            <article className="panel stat-card" key={label}>
              <span>{label} · toàn hệ thống</span>
              <strong>{Number(count).toLocaleString("vi-VN")}</strong>
            </article>
          ))}
        </div>
      )}
      {summary.error && (
        <p className="notice">
          Chưa tải được số liệu tổng báo cáo.{" "}
          <button onClick={invalidate}>Thử lại</button>
        </p>
      )}
      <div className={`admin-reports ${id ? "with-selection" : ""}`}>
        <section
          ref={list}
          tabIndex={-1}
          className="panel admin-report-list"
          aria-label="Danh sách báo cáo"
        >
          <Select
            label="Trạng thái báo cáo"
            value={filters.params.get("status") || ""}
            onChange={(e) => filters.change("status", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {["PENDING", "REVIEWING", "RESOLVED", "DISMISSED"].map((status) => (
              <option key={status} value={status}>
                {statusLabel(status, "report")}
              </option>
            ))}
          </Select>
          <p className="muted">
            {result.data
              ? `${result.data.pagination?.total ?? 0} báo cáo phù hợp`
              : "Đang tải danh sách…"}
          </p>
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} retry={invalidate} />
          ) : result.data?.data.length ? (
            <Table columns={["Báo cáo / Đối tượng", "Trạng thái"]}>
              {result.data.data.map((report) => (
                <tr
                  key={report.id}
                  className={
                    String(report.id) === id ? "admin-selected-row" : ""
                  }
                >
                  <td>
                    <Link
                      className="admin-record-link"
                      aria-current={
                        String(report.id) === id ? "page" : undefined
                      }
                      to={`/quan-tri/bao-cao/${report.id}${filters.params.size ? `?${filters.params}` : ""}`}
                    >
                      <strong>
                        #{report.id} · {report.reason}
                      </strong>
                      <span>Xem xét →</span>
                    </Link>
                    <small>
                      Người gửi #{report.reporterId} ·{" "}
                      {dateLabel(report.createdAt)}
                    </small>
                    <TargetReference
                      type={report.targetType}
                      id={report.targetId}
                      admin
                    />
                  </td>
                  <td>
                    <StatusBadge status={report.status} group="report" />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="Không có báo cáo phù hợp" />
          )}
          <Pagination data={result.data?.pagination} change={filters.page} />
        </section>
        <section className="admin-report-detail" aria-label="Chi tiết báo cáo">
          {id ? (
            <ReportDetail key={id} id={id} />
          ) : (
            <div className="panel">
              <EmptyState title="Chọn báo cáo để xem xét" />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export const AdminReportDetailPage = AdminReportsPage;
function ReportDetail({ id }: { id: string }) {
  const [params] = useSearchParams();
  const result = useResource<Report>(`/admin/reports/${id}`);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (result.data) heading.current?.focus();
  }, [id, Boolean(result.data)]);
  const mutation = useMutation();
  const [next, setNext] = useState<ReportStatus | null>(null);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const report = result.data?.data;
  if (!report) return null;
  return (
    <>
      <Link
        className="back-link"
        to={`/quan-tri/bao-cao${params.size ? `?${params}` : ""}`}
      >
        ← Báo cáo vi phạm
      </Link>

      <section className="panel">
        <div className="section-heading">
          <h2 ref={heading} tabIndex={-1}>
            Báo cáo #{report.id}
          </h2>
          <StatusBadge status={report.status} group="report" />
        </div>
        <p>
          <strong>Lý do:</strong> {report.reason}
        </p>
        <p>
          Đối tượng:{" "}
          <TargetReference
            type={report.targetType}
            id={report.targetId}
            admin
          />
        </p>
        <p className="pre-wrap">
          {report.description || "Không có mô tả thêm."}
        </p>
        {report.targetType === "ITEM" && (
          <ReportItemPreview itemId={report.targetId} />
        )}
        <dl className="summary-list">
          <div>
            <dt>Người gửi</dt>
            <dd>
              <Link to={`/quan-tri/nguoi-dung/${report.reporterId}`}>
                Tài khoản #{report.reporterId}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Thời gian gửi</dt>
            <dd>{dateLabel(report.createdAt)}</dd>
          </div>
          {report.reviewedBy && (
            <div>
              <dt>Người xử lý gần nhất</dt>
              <dd>#{report.reviewedBy}</dd>
            </div>
          )}
          {report.reviewedAt && (
            <div>
              <dt>Xử lý gần nhất</dt>
              <dd>{dateLabel(report.reviewedAt)}</dd>
            </div>
          )}
        </dl>
        <p className="notice">
          Xử lý báo cáo chỉ đổi trạng thái báo cáo. Đóng bài, đình chỉ tài khoản
          hoặc giải quyết yêu cầu nhận đồ là quyết định riêng.
        </p>
        {report.targetType === "CLAIM" && (
          <p className="muted">
            Để xem bằng chứng, hãy tìm yêu cầu nhận đồ theo mã ghi trong báo cáo
            tại danh sách yêu cầu.{" "}
            <Link to="/quan-tri/claims">Mở danh sách yêu cầu nhận đồ ↗</Link>
          </p>
        )}
        <Link
          className="text-link"
          to={`/quan-tri/nhat-ky?entityType=REPORT&entityId=${report.id}`}
        >
          Xem nhật ký liên quan →
        </Link>
        <MutationError error={mutation.error} />
        <div className="actions">
          {report.status === "PENDING" && (
            <Button
              disabled={mutation.busy}
              onClick={() => setNext("REVIEWING")}
            >
              Bắt đầu xem xét
            </Button>
          )}
          {report.status === "REVIEWING" && (
            <>
              <Button
                variant="secondary"
                disabled={mutation.busy}
                onClick={() => setNext("DISMISSED")}
              >
                Bác bỏ báo cáo
              </Button>
              <Button
                disabled={mutation.busy}
                onClick={() => setNext("RESOLVED")}
              >
                Đánh dấu đã giải quyết
              </Button>
            </>
          )}
        </div>
      </section>
      {next && (
        <ConfirmDialog
          title={`Chuyển báo cáo sang “${statusLabel(next, "report")}”?`}
          close={() => setNext(null)}
          busy={mutation.busy}
          confirm={() => {
            void mutation
              .run(`/admin/reports/${id}`, { status: next })
              .then((success) => {
                if (success) setNext(null);
              });
          }}
        >
          {mutation.error ||
            "Thao tác sẽ được ghi nhật ký. Báo cáo đã kết thúc không thể mở lại. Không thể chuyển về trạng thái trước đó."}
        </ConfirmDialog>
      )}
    </>
  );
}
function ReportItemPreview({ itemId }: { itemId: number }) {
  const item = useResource<Item>(`/admin/items/${itemId}`);
  if (item.loading) return <Loading />;
  if (item.error) return <ErrorState error={item.error} retry={invalidate} />;
  const data = item.data?.data;
  return data ? (
    <section className="admin-related-object">
      <h3>Đối tượng liên quan</h3>
      <div>
        <div className="admin-related-image">
          <ItemImage src={data.images[0]?.url} title={data.title} />
        </div>
        <div>
          <h3>{data.title}</h3>
          <div className="badge-row">
            <StatusBadge status={data.type} group="itemType" />
            <StatusBadge status={data.status} group="item" />
          </div>
          <Link className="text-link" to={`/quan-tri/bai-dang/${data.id}`}>
            Xem bài đăng #{data.id} →
          </Link>
        </div>
      </div>
    </section>
  ) : null;
}
