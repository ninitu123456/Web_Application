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
    <section className="page-section narrow">
      <span className="eyebrow">NỘI DUNG BẠN ĐÃ PHẢN ÁNH</span>
      <h1>Báo cáo của tôi</h1>
      <p className="muted">Theo dõi tiến trình xem xét của quản trị viên.</p>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="stack">
          {result.data.data.map((report) => (
            <article className="panel" key={report.id}>
              <div className="section-heading">
                <h2>Báo cáo #{report.id}</h2>
                <StatusBadge status={report.status} group="report" />
              </div>
              <TargetReference type={report.targetType} id={report.targetId} />
              <p className="pre-wrap">
                <strong>{report.reason}</strong>
              </p>
              {report.description && (
                <p className="pre-wrap">{report.description}</p>
              )}
              <small className="muted">
                Gửi {dateLabel(report.createdAt)}
                {report.reviewedAt
                  ? ` · Xử lý gần nhất ${dateLabel(report.reviewedAt)}`
                  : ""}
              </small>
            </article>
          ))}
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
