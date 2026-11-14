import { Icon } from "../components/Icon";
import { useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, errorText, invalidate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource } from "../lib/hooks";
import type { Item } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  EmptyState,
  ErrorState,
  ItemImage,
  Loading,
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
  const location = useLocation();
  const from = location.state?.exploreFrom;
  const exploreFrom =
    typeof from === "string" &&
    (from === "/kham-pha" || from.startsWith("/kham-pha?"))
      ? from
      : "/kham-pha";
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const [claimOpen, setClaimOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const owner = item.userId === user?.id;
  const hidden = item.visibility === "HIDDEN";
  const canInspect = item.type === "FOUND" && (owner || user?.role === "ADMIN");
  const tab =
    params.get("tab") === "claims" && canInspect ? "claims" : "matches";
  async function startChat() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/conversations", {
        method: "POST",
        body: { userId: item.userId },
      });
      navigate(`/tin-nhan?hoi-thoai=${result.data.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
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
      <Link className="back-link" to={exploreFrom}>
        ← Khám phá đồ vật
      </Link>
      {hidden && (
        <p className="notice" role="status">
          Bài đã được quản trị viên gỡ khỏi phần công khai. Chỉ chủ bài và quản
          trị viên xem được trang này. Bạn vẫn có thể xử lý yêu cầu nhận đồ và
          bàn giao hiện có.
        </p>
      )}
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
        <div className="detail-info detail-panel">
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
          <ItemProgress item={item} />
          <h2>Mô tả đồ vật</h2>
          <p className="description">{item.description}</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!hidden &&
            !owner &&
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
          {!hidden && user && !owner && (
            <div className="actions">
              <Button variant="secondary" disabled={busy} onClick={startChat}>
                Nhắn tin
              </Button>
            </div>
          )}
          {!hidden && owner && item.status === "OPEN" && (
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
          {["CLAIMED", "RETURNED", "CLOSED"].includes(item.status) && (
            <p className="notice">
              {item.status === "CLAIMED"
                ? "Đồ vật đang chờ bàn giao cho người đã được xác minh."
                : item.status === "RETURNED"
                  ? "Đồ vật đã được trao lại. Bài đăng được giữ để lưu lịch sử."
                  : "Bài đăng đã đóng và không tiếp nhận yêu cầu mới."}
            </p>
          )}
          {item.type === "FOUND" && (
            <section className="recovery-guide" aria-label="Cách nhận lại đồ">
              <h2>Nhận lại đồ như thế nào?</h2>
              <ol>
                {[
                  [
                    "Gửi bằng chứng",
                    "Gửi yêu cầu nhận đồ với đặc điểm chỉ bạn biết.",
                  ],
                  [
                    "Chờ xác minh",
                    "Chủ bài kiểm tra bằng chứng và xác nhận với bạn.",
                  ],
                  [
                    "Nhận lại đồ",
                    "Thống nhất thời gian, địa điểm và xác nhận bàn giao.",
                  ],
                ].map(([title, text], index) => (
                  <li key={title}>
                    <span>{index + 1}</span>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </li>
                ))}
              </ol>
              <p className="fine-print">
                <Icon name="shield" /> Bằng chứng sở hữu được gửi riêng tư. Nhắn
                tin để trao đổi; gửi yêu cầu nhận đồ để được xác minh chính
                thức.
              </p>
            </section>
          )}
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
        </div>
      </div>
      <div className="detail-tabs">
        <div className="tabs" role="tablist" aria-label="Thông tin liên quan">
          <button
            role="tab"
            aria-selected={tab === "matches"}
            className={tab === "matches" ? "active" : ""}
            onClick={() => setParams({ tab: "matches" })}
          >
            Gợi ý cho bạn
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
          ) : hidden ? (
            <EmptyState title="Bài đã gỡ không tham gia gợi ý đồ vật" />
          ) : owner &&
            ["OPEN", "CLAIM_PENDING", "CLAIMED"].includes(item.status) ? (
            <VisualSuggestions
              key={item.id + ":" + user?.id}
              itemId={item.id}
              enabled={canShowVisualSuggestions({
                enabled:
                  import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_ENABLED === "true",
                owner,
                type: item.type,
                status: item.status,
              })}
              previewFixture={
                import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE ===
                "true"
              }
            />
          ) : (
            <EmptyState
              title={
                user
                  ? "Gợi ý riêng chỉ dành cho chủ bài đang hoạt động"
                  : "Khám phá những kết nối có thể phù hợp"
              }
            >
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
const PROGRESS = [
  "Đã đăng bài",
  "Chờ yêu cầu nhận lại",
  "Xác minh chủ sở hữu",
  "Bàn giao",
];
function ItemProgress({ item }: { item: Item }) {
  if (item.type !== "FOUND" || item.status === "CLOSED") return null;
  const current =
    { OPEN: 1, CLAIM_PENDING: 2, CLAIMED: 3, RETURNED: 4 }[
      item.status as "OPEN" | "CLAIM_PENDING" | "CLAIMED" | "RETURNED"
    ] ?? 1;
  return (
    <section className="item-progress" aria-label="Tiến trình bàn giao">
      <ol className="progress-steps">
        {PROGRESS.map((label, index) => (
          <li
            key={label}
            className={
              index < current
                ? "done"
                : index === current
                  ? "current"
                  : undefined
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">
              {index < current && (
                <Icon name="check" width="13" height="13" strokeWidth="3" />
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}
