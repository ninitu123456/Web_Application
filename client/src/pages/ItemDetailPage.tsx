import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, errorText, invalidate, itemDetail } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource } from "../lib/hooks";
import type { Item, Match } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  ItemCard,
  ItemImage,
  Loading,
  Pagination,
  StatusBadge,
  useToast,
} from "../components/ui";
import { ClaimModal, ReceivedClaims } from "./Claims";
import { ReportButton } from "../components/ReportButton";
import { VisualSuggestions } from "../components/VisualSuggestions";
import { canShowVisualSuggestions } from "../lib/visual-suggestions";
export function ItemDetailPage() {
  const { id } = useParams();
  const item = useResource<Item>(`/items/${id}`);
  if (item.loading) return <Loading />;
  if (item.error) return <ErrorState error={item.error} retry={invalidate} />;
  return item.data ? <Detail key={id} item={item.data.data} /> : null;
}
function Detail({ item }: { item: Item }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const [claimOpen, setClaimOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const owner = item.userId === user?.id;
  const canInspect = item.type === "FOUND" && (owner || user?.role === "ADMIN");
  const tab =
    params.get("tab") === "claims" && canInspect ? "claims" : "matches";
  async function closeItem() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/items/${item.id}/close`, { method: "PATCH" });
      toast("Đã đóng bài đăng.");
      setConfirmClose(false);
      invalidate();
    } catch (e) {
      setError(errorText(e));
      setConfirmClose(false);
      invalidate();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="page-section">
      <Link className="back-link" to="/">
        ← Khám phá đồ vật
      </Link>
      <div className="detail-grid">
        <div className="gallery">
          <div className="gallery-main">
            <ItemImage
              src={item.images[Math.min(selected, item.images.length - 1)]?.url}
              title={item.title}
            />
          </div>
          {item.images.length > 1 && (
            <div className="thumbnails" aria-label="Chọn ảnh">
              {item.images.map((image, index) => (
                <button
                  key={image.id}
                  aria-label={`Xem ảnh ${index + 1}`}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  <ItemImage
                    src={image.url}
                    title={`Ảnh ${index + 1} của ${item.title}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="detail-info">
          <div className="badge-row">
            <StatusBadge status={item.type} group="itemType" />
            <StatusBadge status={item.status} group="item" />
          </div>
          <h1>{item.title}</h1>
          <p className="detail-subtitle">
            {item.category?.name || `Danh mục #${item.categoryId}`} · Bài #
            {item.id}
          </p>
          <dl className="item-facts">
            <div>
              <dt>Địa điểm</dt>
              <dd>{item.location?.name || `#${item.locationId}`}</dd>
            </div>
            <div>
              <dt>Ngày xảy ra</dt>
              <dd>{dateLabel(item.eventDate)}</dd>
            </div>
            {item.color && (
              <div>
                <dt>Màu sắc</dt>
                <dd>{item.color}</dd>
              </div>
            )}
            <div>
              <dt>Ngày đăng</dt>
              <dd>{dateLabel(item.createdAt)}</dd>
            </div>
          </dl>
          <h2>Mô tả đồ vật</h2>
          <p className="description">{item.description}</p>
          {user && (
            <div className="report-actions">
              <ReportButton
                targetType="ITEM"
                targetId={item.id}
                label="Báo cáo bài đăng"
              />
              <ReportButton
                targetType="USER"
                targetId={item.userId}
                label="Báo cáo chủ bài"
              />
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {owner && item.status === "OPEN" && (
            <div className="actions">
              <Link className="button primary" to={`/do-vat/${item.id}/sua`}>
                Chỉnh sửa bài ↗
              </Link>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmClose(true)}
              >
                Đóng bài
              </Button>
            </div>
          )}
          {!owner &&
            item.type === "FOUND" &&
            ["OPEN", "CLAIM_PENDING"].includes(item.status) &&
            (user ? (
              <Button disabled={busy} onClick={() => setClaimOpen(true)}>
                Đây có thể là đồ của tôi →
              </Button>
            ) : (
              <Link
                className="button primary"
                to={`/dang-nhap?next=${encodeURIComponent(`/do-vat/${item.id}`)}`}
              >
                Đăng nhập để nhận đồ →
              </Link>
            ))}
          {["CLAIMED", "RETURNED", "CLOSED"].includes(item.status) && (
            <p className="notice">
              {item.status === "CLAIMED"
                ? "Đồ vật đang chờ bàn giao cho người đã được xác minh."
                : item.status === "RETURNED"
                  ? "Đồ vật đã được trao lại. Bài đăng được giữ để lưu lịch sử."
                  : "Bài đăng đã đóng và không tiếp nhận yêu cầu mới."}
            </p>
          )}
          <p className="fine-print">
            Xác minh thông tin trước khi bàn giao. Không chia sẻ bằng chứng sở
            hữu trong mô tả công khai.
          </p>
        </div>
      </div>
      {canShowVisualSuggestions({
        enabled: import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_ENABLED === "true",
        owner,
        type: item.type,
        status: item.status,
      }) && <VisualSuggestions
        itemId={item.id}
        previewFixture={import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE === "true"}
      />}
      <div className="detail-tabs">
        <div className="tabs" role="tablist" aria-label="Thông tin liên quan">
          <button
            role="tab"
            aria-selected={tab === "matches"}
            className={tab === "matches" ? "active" : ""}
            onClick={() => setParams({ tab: "matches" })}
          >
            Gợi ý đồ vật
          </button>
          {canInspect && (
            <button
              role="tab"
              aria-selected={tab === "claims"}
              className={tab === "claims" ? "active" : ""}
              onClick={() => setParams({ tab: "claims" })}
            >
              Yêu cầu nhận được
            </button>
          )}
        </div>
        <div className="tab-content" role="tabpanel">
          {tab === "claims" ? (
            <ReceivedClaims itemId={item.id} canAct={owner} />
          ) : user ? (
            <Matches itemId={item.id} />
          ) : (
            <EmptyState title="Khám phá những kết nối có thể phù hợp">
              <Link
                className="button secondary"
                to={`/dang-nhap?next=${encodeURIComponent(`/do-vat/${item.id}`)}`}
              >
                Đăng nhập để xem gợi ý ↗
              </Link>
            </EmptyState>
          )}
        </div>
      </div>
      {claimOpen && (
        <ClaimModal itemId={item.id} close={() => setClaimOpen(false)} />
      )}
      {confirmClose && (
        <ConfirmDialog
          title="Đóng bài đăng này?"
          busy={busy}
          close={() => setConfirmClose(false)}
          confirm={() => void closeItem()}
        >
          Bài đăng sẽ ngừng nhận yêu cầu và gợi ý đồ vật liên quan. Nội dung vẫn
          có thể được xem công khai.
        </ConfirmDialog>
      )}
    </section>
  );
}
function Matches({ itemId }: { itemId: number }) {
  const [page, setPage] = useState(1);
  const result = useResource<Match[]>(`/items/${itemId}/matches`, {
    page,
    limit: 6,
  });
  const [items, setItems] = useState<Map<number, Item>>(new Map());
  const [failed, setFailed] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const rows = result.data?.data;
  useEffect(() => {
    let active = true;
    setItems(new Map());
    setFailed([]);
    if (!rows?.length) return;
    setLoading(true);
    Promise.allSettled(
      [...new Set(rows.map((match) => match.itemId))].map((id) =>
        itemDetail(id).then((item) => [id, item] as const),
      ),
    ).then((responses) => {
      if (!active) return;
      const found = new Map<number, Item>();
      const errors: number[] = [];
      const ids = [...new Set(rows.map((match) => match.itemId))];
      responses.forEach((response, index) => {
        if (response.status === "fulfilled") found.set(...response.value);
        else errors.push(ids[index]);
      });
      setItems(found);
      setFailed(errors);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [rows]);
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Những kết nối có thể phù hợp</h2>
          <p className="muted">
            Điểm càng cao, hai bài đăng càng giống nhau. Hãy kiểm tra thông tin
            để xác định đúng đồ vật.
          </p>
        </div>
      </div>
      {result.loading || loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : rows?.length ? (
        <div className="item-grid matches-grid">
          {rows.map((match) => (
            <div key={match.matchId} className="match-card">
              {items.get(match.itemId) ? (
                <ItemCard item={items.get(match.itemId)!} />
              ) : (
                <div className="panel">
                  <Link to={`/do-vat/${match.itemId}`}>
                    Xem bài #{match.itemId} ↗
                  </Link>
                  {failed.includes(match.itemId) && (
                    <p className="muted">Chưa tải được ảnh và tiêu đề.</p>
                  )}
                </div>
              )}
              <div className="match-reasons">
                <strong>
                  {match.score}/100 <span>điểm tương đồng</span>
                </strong>
                <ul>
                  {match.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Chưa có gợi ý đồ vật phù hợp">
          <p>Gợi ý dựa trên danh mục, địa điểm, ngày và nội dung bài đăng.</p>
        </EmptyState>
      )}
      <Pagination data={result.data?.pagination} change={setPage} />
    </section>
  );
}
