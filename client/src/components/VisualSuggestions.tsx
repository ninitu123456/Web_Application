import { useEffect, useState } from "react";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Suggestion, SuggestionsData } from "../lib/types";
import { EmptyState, ErrorState, ItemCard, Pagination } from "./ui";

const bandLabels = {
  VERY_HIGH: "Rất giống",
  HIGH: "Khá giống",
  MEDIUM: "Có thể liên quan",
};
export function VisualSuggestions({
  itemId,
  enabled = true,
  previewFixture = false,
}: {
  itemId: number;
  enabled?: boolean;
  previewFixture?: boolean;
}) {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const result = useResource<SuggestionsData>(
    `/items/${itemId}/suggestions`,
    { page, limit: 6, visual: String(enabled) },
    refresh,
  );
  const state = result.data?.visualState;
  useEffect(() => {
    if (!enabled || !result.data || result.error || state === "disabled")
      return;
    const timer = setTimeout(
      () => setRefresh((value) => value + 1),
      state === "processing" ? 10000 : 30000,
    );
    return () => clearTimeout(timer);
  }, [enabled, refresh, result.data, result.error, state]);
  useEffect(() => {
    if (
      result.data?.pagination &&
      page > Math.max(1, result.data.pagination.totalPages)
    )
      setPage(Math.max(1, result.data.pagination.totalPages));
  }, [page, result.data]);
  const data = result.data?.data;
  const cards = (entries: Suggestion[]) => (
    <div className="item-grid matches-grid">
      {entries.map((entry) => (
        <div
          className={
            entry.reasons.includes("IMAGE")
              ? "match-card visual-suggestion-card"
              : "match-card"
          }
          key={entry.item.id}
          data-item-id={entry.item.id}
        >
          <ItemCard item={entry.item} />
          <div className="match-reasons">
            <div className="suggestion-reasons">
              {entry.reasons.includes("IMAGE") && (
                <span className="badge">Giống về hình ảnh</span>
              )}
              {entry.reasons.includes("INFORMATION") && (
                <span className="badge">Trùng thông tin</span>
              )}
            </div>
            {entry.similarityBand && (
              <p className="similarity-band">
                {bandLabels[entry.similarityBand]}
              </p>
            )}
            {entry.informationScore !== undefined && (
              <p>{entry.informationScore}/100 điểm trùng thông tin</p>
            )}
            {entry.informationReasons && (
              <ul>
                {entry.informationReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <section
      className="unified-suggestions"
      aria-labelledby="suggestions-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="suggestions-title">Gợi ý cho bạn</h2>
          <p className="muted">Gợi ý không phải là xác nhận quyền sở hữu.</p>
          {data && (
            <p className="muted">
              {data.totalUnique} kết quả phù hợp từ các nguồn gợi ý.
            </p>
          )}
        </div>
      </div>
      {previewFixture && enabled && (
        <p className="visual-suggestions-preview-note" role="note">
          Dữ liệu minh họa: điểm số cố định, không phải kết quả CLIP thực tế.
        </p>
      )}
      {result.loading ? (
        <div
          className="item-grid matches-grid"
          role="status"
          aria-label="Đang tải gợi ý"
        >
          {[1, 2, 3].map((id) => (
            <div className="card-skeleton suggestion-skeleton" key={id}>
              <span />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : (
        <>
          {enabled && state !== "disabled" && (
            <section
              className="visual-suggestions"
              aria-labelledby="visual-suggestions-title"
            >
              <h3 id="visual-suggestions-title">Giống về hình ảnh</h3>
              {state === "processing" ? (
                <div role="status">
                  <p>
                    Ảnh đang được phân tích. Gợi ý sẽ cập nhật khi xử lý hoàn
                    tất.
                  </p>
                  <button className="button secondary" onClick={invalidate}>
                    Kiểm tra lại
                  </button>
                </div>
              ) : state === "error" ? (
                <div role="alert">
                  <p>Chưa thể phân tích ảnh. Vui lòng thử kiểm tra lại sau.</p>
                  <button className="button secondary" onClick={invalidate}>
                    Thử tải lại
                  </button>
                </div>
              ) : data?.visual.length ? (
                cards(data.visual)
              ) : (
                <EmptyState title="Chưa có gợi ý hình ảnh phù hợp" />
              )}
            </section>
          )}
          <section aria-labelledby="information-suggestions-title">
            <h3 id="information-suggestions-title">Trùng thông tin</h3>
            {data?.information.length ? (
              cards(data.information)
            ) : (
              <EmptyState
                title={
                  data?.visual.some((entry) =>
                    entry.reasons.includes("INFORMATION"),
                  )
                    ? "Các kết quả trùng thông tin đã được gộp ở trên"
                    : "Chưa có gợi ý đồ vật phù hợp"
                }
              />
            )}
            <Pagination data={result.data?.pagination} change={setPage} />
          </section>
        </>
      )}
    </section>
  );
}
