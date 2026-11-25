import { Link, useSearchParams } from "react-router-dom";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useSaved } from "../lib/saved";
import type { Item } from "../lib/types";
import {
  EmptyState,
  ErrorState,
  ItemCard,
  Loading,
  Pagination,
} from "../components/ui";

export function SavedItemsPage() {
  const [params, setParams] = useSearchParams();
  const saved = useSaved();
  const result = useResource<Item[]>("/saved-items", {
    page: params.get("page") || "1",
    limit: 12,
  });
  // Unsaving on this page hides the card immediately; the list refetches on next visit.
  const items = (result.data?.data ?? []).filter((item) =>
    saved.isSaved(item.id),
  );
  return (
    <section className="page-section">
      <h1>Tin đã lưu</h1>
      <p className="page-lead">
        Bấm biểu tượng trái tim trên tin bất kỳ để lưu lại và theo dõi sau.
      </p>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : items.length ? (
        <div className="item-grid four">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState title="Bạn chưa lưu tin nào">
          <Link className="button secondary" to="/kham-pha">
            Khám phá đồ vật ↗
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
