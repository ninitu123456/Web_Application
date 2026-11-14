import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Item } from "../lib/types";
import { Icon } from "../components/Icon";
import {
  dateLabel,
  EmptyState,
  ErrorState,
  ItemImage,
  Loading,
  Pagination,
  StatusBadge,
} from "../components/ui";
export function MyItemsPage() {
  const [params, setParams] = useSearchParams();
  const result = useResource<Item[]>("/items/mine", {
    page: params.get("page") || "1",
    limit: 12,
  });
  const total = result.data?.pagination?.total;
  return (
    <section className="page-section my-page">
      <div className="section-heading">
        <div>
          <h1>Bài đăng của tôi</h1>
          <p className="muted">
            {typeof total === "number"
              ? `${total} bài đăng · sửa, đóng bài và xử lý yêu cầu nhận lại ngay tại đây.`
              : "Sửa, đóng bài và xử lý yêu cầu nhận lại ngay tại đây."}
          </p>
        </div>
        <Link className="button primary" to="/dang-bai">
          <Icon name="plus" width="17" height="17" /> Đăng bài mới
        </Link>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="my-list">
          {result.data.data.map((item) => {
            const editable =
              item.status === "OPEN" && item.visibility !== "HIDDEN";
            return (
              <article key={item.id} className="my-row">
                <Link
                  className="my-row-image"
                  to={`/do-vat/${item.id}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <ItemImage src={item.images[0]?.url} title={item.title} />
                </Link>
                <div className="my-row-body">
                  <div className="badge-row">
                    <StatusBadge status={item.type} group="itemType" />
                    <StatusBadge status={item.status} group="item" />
                    {item.visibility === "HIDDEN" && (
                      <span className="badge">Đã gỡ khỏi công khai</span>
                    )}
                  </div>
                  <h2>
                    <Link to={`/do-vat/${item.id}`}>{item.title}</Link>
                  </h2>
                  <small>
                    {item.location?.name || `Địa điểm #${item.locationId}`} ·{" "}
                    {dateLabel(item.eventDate)} · Bài #{item.id}
                  </small>
                </div>
                <div className="my-item-actions">
                  {item.type === "FOUND" && (
                    <Link
                      className="primary-action"
                      to={`/do-vat/${item.id}?tab=claims`}
                    >
                      Yêu cầu nhận đồ
                    </Link>
                  )}
                  {editable && (
                    <Link to={`/do-vat/${item.id}/sua`}>Sửa bài</Link>
                  )}
                  <Link
                    to={`/do-vat/${item.id}`}
                    aria-label={`${editable ? "Chi tiết và đóng bài" : "Chi tiết"} ${item.title}`}
                  >
                    {editable ? "Chi tiết / Đóng bài" : "Chi tiết"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Bạn chưa có bài đăng nào">
          <Link className="button secondary" to="/dang-bai">
            Đăng bài đầu tiên ↗
          </Link>
        </EmptyState>
      )}
      <Pagination
        data={result.data?.pagination}
        change={(page) => setParams({ page: String(page) })}
      />
    </section>
  );
}
