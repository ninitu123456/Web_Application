import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Item } from "../lib/types";
import {
  EmptyState,
  ErrorState,
  ItemCard,
  Loading,
  Pagination,
} from "../components/ui";
export function MyItemsPage() {
  const [params, setParams] = useSearchParams();
  const result = useResource<Item[]>("/items/mine", {
    page: params.get("page") || "1",
    limit: 12,
  });
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h1>Bài đăng của tôi</h1>
        </div>
        <Link className="button primary" to="/dang-bai">
          ＋ Đăng bài mới
        </Link>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="item-grid">
          {result.data.data.map((item) => (
            <div key={item.id}>
              <ItemCard item={item} />
              <div className="my-item-actions">
                {item.status === "OPEN" && item.visibility !== "HIDDEN" && (
                  <Link to={`/do-vat/${item.id}/sua`}>Sửa bài ↗</Link>
                )}
                <Link to={`/do-vat/${item.id}`}>
                  Chi tiết
                  {item.status === "OPEN" && item.visibility !== "HIDDEN"
                    ? " / Đóng bài"
                    : ""}
                </Link>
                {item.type === "FOUND" && (
                  <Link to={`/do-vat/${item.id}?tab=claims`}>
                    Yêu cầu nhận đồ ↗
                  </Link>
                )}
              </div>
            </div>
          ))}
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
