import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { VisualSuggestion } from "../lib/types";
import { EmptyState, ErrorState, ItemImage, Loading } from "./ui";
import { Icon } from "./Icon";

export function VisualSuggestions({
  itemId,
  previewFixture = false,
}: {
  itemId: number;
  previewFixture?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const result = useResource<VisualSuggestion[]>(
    `/items/${itemId}/visual-suggestions`,
    {}, refresh,
  );
  const processing = result.data?.visualState === 'processing';
  useEffect(() => {
    if (!result.data || result.error) return;
    // FOUND jobs may finish after this LOST job. Refresh ready/empty results
    // too, so a panel opened during backfill eventually receives those pairs.
    const timer = setTimeout(() => setRefresh(value => value + 1), processing ? 10000 : 30000);
    return () => clearTimeout(timer);
  }, [processing, refresh, result.data, result.error]);
  const suggestions = result.data?.data;
  return (
    <section
      className="visual-suggestions"
      aria-labelledby="visual-suggestions-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Icon name="image" /> Gợi ý hình ảnh AI
          </span>
          <h2 id="visual-suggestions-title">Vật phẩm có thể tương tự</h2>
          <p className="muted">
            Đây là gợi ý dựa trên hình ảnh do AI phân tích, không phải xác nhận
            hai vật phẩm là một. Hãy kiểm tra thông tin trước khi liên hệ hoặc
            gửi yêu cầu nhận lại.
          </p>
        </div>
      </div>
      {previewFixture && (
        <p className="visual-suggestions-preview-note" role="note">
          Dữ liệu minh họa: điểm số cố định, không phải kết quả CLIP thực tế.
        </p>
      )}
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.visualState === 'error' ? (
        <div role="alert"><p>Chưa thể phân tích ảnh. Vui lòng thử kiểm tra lại sau.</p><button onClick={invalidate}>Thử tải lại</button></div>
      ) : processing ? (
        <div role="status"><p>Ảnh đang được phân tích. Gợi ý sẽ cập nhật khi xử lý hoàn tất.</p><button onClick={invalidate}>Kiểm tra lại</button></div>
      ) : suggestions?.length ? (
        <div className="visual-suggestion-grid">
          {suggestions.slice(0, 3).map((suggestion) => (
            <article className="visual-suggestion-card" key={suggestion.itemId}>
              <Link
                className="visual-suggestion-image"
                to={`/do-vat/${suggestion.itemId}`}
                aria-label={`Xem vật phẩm ${suggestion.title}`}
              >
                <ItemImage
                  src={suggestion.thumbnailUrl ?? undefined}
                  title={suggestion.title}
                />
              </Link>
              <div className="visual-suggestion-content">
                <span className="visual-suggestion-label">Đồ nhặt được</span>
                <h3>
                  <Link to={`/do-vat/${suggestion.itemId}`}>
                    {suggestion.title}
                  </Link>
                </h3>
                <p className="visual-suggestion-meta">
                  {suggestion.category} · {suggestion.location}
                </p>
                <p className="visual-suggestion-description">
                  {suggestion.description}
                </p>
                <p className="visual-suggestion-score">
                  <span>Điểm tương đồng hình ảnh</span>
                  <strong>{suggestion.cosineScore.toFixed(3)}</strong>
                </p>
                <Link
                  className="visual-suggestion-link"
                  to={`/do-vat/${suggestion.itemId}`}
                >
                  Xem bài đăng <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Chưa có gợi ý hình ảnh phù hợp">
          <p>
            Khi có ảnh được phân tích, các bài FOUND có điểm tương đồng cao sẽ
            xuất hiện tại đây.
          </p>
        </EmptyState>
      )}
    </section>
  );
}
