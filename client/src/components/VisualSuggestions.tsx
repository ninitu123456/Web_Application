import { Link } from 'react-router-dom';
import { invalidate } from '../lib/api';
import { useResource } from '../lib/hooks';
import type { VisualSuggestion } from '../lib/types';
import { EmptyState, ErrorState, ItemImage, Loading } from './ui';

export function VisualSuggestions({ itemId, previewFixture = false }: { itemId: number; previewFixture?: boolean }) {
  const result = useResource<VisualSuggestion[]>(`/items/${itemId}/visual-suggestions`);
  const suggestions = result.data?.data;
  return (
    <section className="visual-suggestions" aria-labelledby="visual-suggestions-title">
      <div className="section-heading">
        <div>
          <h2 id="visual-suggestions-title">Vật phẩm có thể tương tự</h2>
          <p className="muted">
            Đây là gợi ý dựa trên hình ảnh do AI phân tích, không phải xác nhận hai vật phẩm là một. Hãy kiểm tra thông tin trước khi liên hệ hoặc gửi yêu cầu nhận lại.
          </p>
        </div>
      </div>
      {previewFixture && <p className="visual-suggestions-preview-note" role="note">Dữ liệu minh họa: điểm số cố định, không phải kết quả CLIP thực tế.</p>}
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : suggestions?.length ? (
        <div className="visual-suggestion-grid">
          {suggestions.slice(0, 3).map((suggestion) => (
            <article className="visual-suggestion-card" key={suggestion.itemId}>
              <Link className="visual-suggestion-image" to={`/do-vat/${suggestion.itemId}`} aria-label={`Xem vật phẩm ${suggestion.title}`}>
                <ItemImage src={suggestion.thumbnailUrl ?? undefined} title={suggestion.title} />
              </Link>
              <div className="visual-suggestion-content">
                <span className="visual-suggestion-label">Đồ nhặt được</span>
                <h3><Link to={`/do-vat/${suggestion.itemId}`}>{suggestion.title}</Link></h3>
                <p className="visual-suggestion-meta">{suggestion.category} · {suggestion.location}</p>
                <p className="visual-suggestion-description">{suggestion.description}</p>
                <p className="visual-suggestion-score">
                  <span>Điểm tương đồng hình ảnh</span>
                  <strong>{suggestion.cosineScore.toFixed(3)}</strong>
                </p>
                <Link className="visual-suggestion-link" to={`/do-vat/${suggestion.itemId}`}>
                  Xem bài đăng <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Chưa có gợi ý hình ảnh phù hợp">
          <p>Khi có ảnh được phân tích, các bài FOUND có điểm tương đồng cao sẽ xuất hiện tại đây.</p>
        </EmptyState>
      )}
    </section>
  );
}
