import { statusLabel } from "../../lib/display-labels";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useResource } from "../../lib/hooks";
import { invalidate } from "../../lib/api";
import type { Report, ReportStatus } from "../../lib/extended-types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
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
  const filters = useAdminQuery(["status"]);
  const result = useResource<Report[]>("/admin/reports", filters.query);
  return (
    <>
      <AdminTitle title="Báo cáo vi phạm" />
      <div className="admin-filters">
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
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <Table
          columns={[
            "Báo cáo",
            "Đối tượng bị báo cáo",
            "Trạng thái",
            "Thao tác",
          ]}
        >
          {result.data.data.map((report) => (
            <tr key={report.id}>
              <td>
                <strong>
                  #{report.id} · {report.reason}
                </strong>
                <small>
                  Người gửi #{report.reporterId} · {dateLabel(report.createdAt)}
                </small>
              </td>
              <td>
                <TargetReference
                  type={report.targetType}
                  id={report.targetId}
                  admin
                />
              </td>
              <td>
                <StatusBadge status={report.status} group="report" />
              </td>
              <td>
                <Link to={`/quan-tri/bao-cao/${report.id}`}>Xem xét ↗</Link>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Không có báo cáo phù hợp" />
      )}
      <Pagination data={result.data?.pagination} change={filters.page} />
    </>
  );
}
export function AdminReportDetailPage() {
  const { id } = useParams();
  const result = useResource<Report>(`/admin/reports/${id}`);
  const mutation = useMutation();
  const [next, setNext] = useState<ReportStatus | null>(null);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={invalidate} />;
  const report = result.data?.data;
  if (!report) return null;
  return (
    <>
      <Link className="back-link" to="/quan-tri/bao-cao">
        ← Báo cáo vi phạm
      </Link>
      <AdminTitle title={`Báo cáo #${report.id}`} />
      <section className="panel">
        <div className="section-heading">
          <h2>{report.reason}</h2>
          <StatusBadge status={report.status} group="report" />
        </div>
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
