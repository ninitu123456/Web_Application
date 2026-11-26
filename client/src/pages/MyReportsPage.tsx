import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Report, ReportTarget } from "../lib/extended-types";
import {
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  StatusBadge,
} from "../components/ui";
export function TargetReference({
  type,
  id,
  admin = false,
}: {
  type: ReportTarget;
  id: number;
  admin?: boolean;
}) {
  const label = `${type === "ITEM" ? "Bài đăng" : type === "USER" ? "Tài khoản" : "Yêu cầu nhận đồ"} #${id}`;
  const url =
    type === "ITEM"
      ? admin
        ? `/quan-tri/bai-dang/${id}`
        : `/do-vat/${id}`
      : type === "USER" && admin
        ? `/quan-tri/nguoi-dung/${id}`
        : type === "CLAIM" && admin
          ? `/quan-tri/claims?claim=${id}`
          : null;
  return url ? (
    <Link className="text-link" to={url}>
      {label} ↗
    </Link>
  ) : (
    <span>{label}</span>
  );
}
export function MyReportsPage() {
  const [params, setParams] = useSearchParams();
  const result = useResource<Report[]>("/reports/mine", {
    page: params.get("page") || "1",
    limit: 10,
  });
  return (
    <section className="page-section">
      <h1>Báo cáo của tôi</h1>
      <p className="page-lead">
        Theo dõi kết quả các báo cáo vi phạm bạn đã gửi.
      </p>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="report-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Đối tượng</th>
                <th scope="col">Lý do</th>
                <th scope="col">Ngày gửi</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {result.data.data.map((report) => (
                <tr key={report.id}>
                  <td>
                    <TargetReference
                      type={report.targetType}
                      id={report.targetId}
                    />
                    <small className="muted">Báo cáo #{report.id}</small>
                  </td>
                  <td>
                    <strong className="pre-wrap">{report.reason}</strong>
                    {report.description && (
                      <small className="muted pre-wrap">
                        {report.description}
                      </small>
                    )}
                  </td>
                  <td>{dateLabel(report.createdAt)}</td>
                  <td>
                    <StatusBadge status={report.status} group="report" />
                  </td>
                  <td>
                    {RESULT[report.status]}
                    {report.reviewedAt && (
                      <small className="muted">
                        Cập nhật {dateLabel(report.reviewedAt)}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Bạn chưa gửi báo cáo nào" />
      )}
      <Pagination
        data={result.data?.pagination}
        change={(page) => setParams({ page: String(page) })}
      />
    </section>
  );
}

const RESULT: Record<string, string> = {
  PENDING: "Đang chờ ban quản trị xem",
  REVIEWING: "Ban quản trị đang xem xét",
  RESOLVED: "Đã xử lý vi phạm",
  DISMISSED: "Không vi phạm quy tắc",
};
