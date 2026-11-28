import { useNotificationArrival } from "../lib/notification-navigation";
import { Icon } from "../components/Icon";
import { useEffect, useRef, useState } from "react";
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
import type { Item, ItemStats } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  dateLabel,
  ErrorState,
  ItemCard,
  ItemImage,
  Loading,
  StatusBadge,
  useToast,
} from "../components/ui";
import { ClaimModal, ReceivedClaims } from "./Claims";
import { ReportButton } from "../components/ReportButton";
import { SaveButton } from "../components/SaveButton";
import { FoundItModal } from "../components/FoundItModal";
import { VisualSuggestions } from "../components/VisualSuggestions";
import { canShowVisualSuggestions } from "../lib/visual-suggestions";
export function ItemDetailPage() {
  const { id } = useParams();
  const item = useResource<Item>(`/items/${id}`);
  if (item.loading) return <Loading />;
  if (item.error) return <ErrorState error={item.error} retry={invalidate} />;
  return item.data ? <Detail key={id} item={item.data.data} /> : null;
}
// One view per page load; StrictMode double effects must not double count.
const viewed = new Set<number>();
function OwnerStats({ itemId }: { itemId: number }) {
  const stats = useResource<ItemStats>(`/items/${itemId}/stats`);
  const data = stats.data?.data;
  if (typeof data?.views !== "number") return null;
  return (
    <ul className="owner-stats" aria-label="Thống kê tin">
      <li>
        <Icon name="eye" /> <strong>{data.views}</strong> lượt xem
      </li>
      <li>
        <Icon name="heart" /> <strong>{data.saves}</strong> lượt lưu
      </li>
      {data.claims > 0 && (
        <li>
          <Icon name="shield" /> <strong>{data.claims}</strong> yêu cầu
          {data.pendingClaims ? ` · ${data.pendingClaims} chờ duyệt` : ""}
        </li>
      )}
    </ul>
  );
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
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [claimsReady, setClaimsReady] = useState(false);
  const arrival = useNotificationArrival({
    itemId: item.id,
    suggestionsReady,
    claimsReady,
  });
  const [selected, setSelected] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [foundOpen, setFoundOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const owner = item.userId === user?.id;
  useEffect(() => {
    if (owner || viewed.has(item.id) || item.visibility === "HIDDEN") return;
    viewed.add(item.id);
    void api(`/items/${item.id}/views`, { method: "POST" }).catch(() =>
      viewed.delete(item.id),
    );
  }, [item.id, owner, item.visibility]);
  const hidden = item.visibility === "HIDDEN";
  const canInspect = item.type === "FOUND" && (owner || user?.role === "ADMIN");
  const showSuggestions =
    owner &&
    !hidden &&
    ["OPEN", "CLAIM_PENDING", "CLAIMED"].includes(item.status);
  const tab =
    canInspect && (params.get("tab") === "claims" || !showSuggestions)
      ? "claims"
      : "matches";
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
  const open = !hidden && ["OPEN", "CLAIM_PENDING"].includes(item.status);
  const loginTo = `/dang-nhap?next=${encodeURIComponent(`/do-vat/${item.id}`)}`;
  const isLost = item.type === "LOST";
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Đã sao chép đường dẫn tin đăng.");
      }
    } catch {
      /* The person closed the share sheet. */
    }
  }
  return (
    <section className="page-section detail-v3">
      {arrival.error && (
        <p className="notice" role="alert">
          {arrival.error}
        </p>
      )}
      <nav className="crumbs" aria-label="Vị trí trang">
        <Link
          className="back-link"
          to={owner && !from ? "/bai-dang-cua-toi" : exploreFrom}
        >
          ← {owner && !from ? "Đồ của tôi" : "Khám phá"}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{isLost ? "Bị mất" : "Nhặt được"}</span>
        <span aria-hidden="true">/</span>
        <span>{item.title}</span>
      </nav>
      {hidden && (
        <p className="notice" role="status">
          Bài đã được quản trị viên gỡ khỏi phần công khai. Chỉ chủ bài và quản
          trị viên xem được trang này. Bạn vẫn có thể xử lý yêu cầu nhận đồ và
          bàn giao hiện có.
        </p>
      )}
      <div className="detail-grid">
        <div className="gallery">
          <div
            className="gallery-main"
            role={item.images.length > 1 ? "region" : undefined}
            aria-label={item.images.length > 1 ? "Ảnh đồ vật" : undefined}
            tabIndex={item.images.length > 1 ? 0 : undefined}
            onKeyDown={(event) => {
              if (
                item.images.length < 2 ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
              )
                return;
              event.preventDefault();
              setSelected(
                (index) =>
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    item.images.length) %
                  item.images.length,
              );
            }}
            onTouchStart={(event) => {
              const point = event.touches[0];
              touch.current = { x: point.clientX, y: point.clientY };
            }}
            onTouchEnd={(event) => {
              const start = touch.current;
              touch.current = null;
              const point = event.changedTouches[0];
              if (!start || !point || item.images.length < 2) return;
              const dx = point.clientX - start.x,
                dy = point.clientY - start.y;
              if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy))
                setSelected(
                  (index) =>
                    (index + (dx < 0 ? 1 : -1) + item.images.length) %
                    item.images.length,
                );
            }}
          >
            <ItemImage
              src={item.images[Math.min(selected, item.images.length - 1)]?.url}
              title={item.title}
              category={item.category?.name}
            />
            {item.images.length > 1 && (
              <span className="gallery-count" role="status" aria-live="polite">
                {Math.min(selected, item.images.length - 1) + 1} /{" "}
                {item.images.length}
              </span>
            )}
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
            {item.category?.name && (
              <span className="badge">{item.category.name}</span>
            )}
            <StatusBadge status={item.status} group="item" />
          </div>
          <h1>{item.title}</h1>
          <p className="description">{item.description}</p>
          <dl className="fact-rows">
            <div>
              <dt>
                <span className="fact-icon">
                  <Icon name="pin" />
                </span>
                {isLost ? "Nơi có thể bị mất" : "Nơi nhặt được"}
              </dt>
              <dd>{item.location?.name || `#${item.locationId}`}</dd>
            </div>
            <div>
              <dt>
                <span className="fact-icon">
                  <Icon name="clock" />
                </span>
                {isLost ? "Ngày bị mất" : "Ngày nhặt được"}
              </dt>
              <dd>{dateLabel(item.eventDate)}</dd>
            </div>
            {item.color && (
              <div>
                <dt>
                  <span className="fact-icon">
                    <Icon name="image" />
                  </span>
                  Màu sắc
                </dt>
                <dd>{item.color}</dd>
              </div>
            )}
            <div>
              <dt>
                <span className="fact-icon">
                  <Icon name="calendar" />
                </span>
                Ngày đăng
              </dt>
              <dd>{dateLabel(item.createdAt)}</dd>
            </div>
          </dl>
          <ItemProgress item={item} />
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {item.owner && !owner && (
            <div className="poster-box">
              <span className="avatar" aria-hidden="true">
                {item.owner.fullName.trim().slice(0, 1).toLocaleUpperCase("vi")}
              </span>
              <div>
                <strong>{item.owner.fullName}</strong>
                <small>
                  {isLost ? "Người bị mất" : "Người nhặt được"}
                  {item.owner.returnedCount > 0
                    ? ` · đã trả lại ${item.owner.returnedCount} món`
                    : " · thành viên FindIt"}
                </small>
              </div>
              {user && (
                <ReportButton
                  targetType="USER"
                  targetId={item.userId}
                  label="Báo cáo"
                />
              )}
            </div>
          )}
          {open && !owner && !isLost && (
            <div className="cta-box dark">
              <strong>Đây là đồ của bạn?</strong>
              <p>
                {item.verificationQuestions?.length
                  ? `Trả lời ${item.verificationQuestions.length} câu hỏi xác minh của người nhặt và mô tả đặc điểm riêng.`
                  : "Mô tả đặc điểm chỉ chủ thật mới biết. Bằng chứng chỉ người nhặt được xem."}
              </p>
              {user ? (
                <Button
                  className="light"
                  disabled={busy}
                  onClick={() => setClaimOpen(true)}
                >
                  <Icon name="shield" /> Gửi yêu cầu nhận lại
                </Button>
              ) : (
                <Link className="button light" to={loginTo}>
                  Đăng nhập để gửi yêu cầu
                </Link>
              )}
            </div>
          )}
          {open && !owner && isLost && (
            <div className="cta-box green">
              <strong>Bạn đã nhặt được món này?</strong>
              <p>
                Báo cho chủ đồ kèm nơi bạn nhặt được. FindIt mở cuộc trò chuyện
                riêng giữa hai bạn.
              </p>
              {user ? (
                <Button
                  className="success"
                  disabled={busy}
                  onClick={() => setFoundOpen(true)}
                >
                  <Icon name="box" /> Tôi đã nhặt được món này
                </Button>
              ) : (
                <Link className="button success" to={loginTo}>
                  Đăng nhập để báo cho chủ đồ
                </Link>
              )}
            </div>
          )}
          {!hidden && user && !owner && !isLost && (
            <Button
              id="contact-action"
              className="wide"
              variant="secondary"
              disabled={busy}
              onClick={startChat}
            >
              <Icon name="message" />
              {arrival.target?.kind === "CLAIM_CONTACT"
                ? "Liên hệ người nhặt"
                : "Nhắn tin hỏi thêm"}
            </Button>
          )}
          {!hidden && owner && (
            <div className="owner-box">
              <p>
                <Icon name="eye" /> <strong>Tin của bạn</strong> · đăng ngày{" "}
                {dateLabel(item.createdAt)}
              </p>
              <OwnerStats itemId={item.id} />
              {item.status === "OPEN" && (
                <div className="actions">
                  <Link
                    className="button secondary"
                    to={`/do-vat/${item.id}/sua`}
                  >
                    <Icon name="cog" /> Sửa tin
                  </Link>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmClose(true)}
                  >
                    <Icon name="close" />{" "}
                    {isLost ? "Đã tìm thấy · Đóng tin" : "Đóng tin"}
                  </Button>
                </div>
              )}
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
          <div className="util-row">
            {!hidden && (
              <SaveButton
                itemId={item.id}
                ownerId={item.userId}
                variant="detail"
              />
            )}
            <Button variant="secondary" onClick={() => void share()}>
              <Icon name="share" /> Chia sẻ
            </Button>
            {user && !owner && (
              <>
                <ReportButton
                  targetType="ITEM"
                  targetId={item.id}
                  label="Báo cáo tin"
                />
                {!item.owner && (
                  <ReportButton
                    targetType="USER"
                    targetId={item.userId}
                    label="Báo cáo người đăng"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {!owner && <RelatedItems item={item} />}
      {(showSuggestions || canInspect) && (
        <div className="detail-tabs" id="received-claims" tabIndex={-1}>
          <div className="tabs" role="tablist" aria-label="Thông tin liên quan">
            {showSuggestions && (
              <button
                role="tab"
                aria-selected={tab === "matches"}
                className={tab === "matches" ? "active" : ""}
                onClick={() => setParams({ tab: "matches" })}
              >
                Gợi ý cho bạn
              </button>
            )}
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
              <ReceivedClaims
                itemId={item.id}
                canAct={owner}
                onReady={setClaimsReady}
              />
            ) : showSuggestions ? (
              <VisualSuggestions
                key={item.id + ":" + user?.id}
                itemId={item.id}
                onReady={() => setSuggestionsReady(true)}
                enabled={canShowVisualSuggestions({
                  enabled:
                    import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_ENABLED ===
                    "true",
                  owner,
                  type: item.type,
                  status: item.status,
                })}
                previewFixture={
                  import.meta.env.VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE ===
                  "true"
                }
              />
            ) : null}
          </div>
        </div>
      )}
      {claimOpen && (
        <ClaimModal
          itemId={item.id}
          questions={item.verificationQuestions}
          close={() => setClaimOpen(false)}
        />
      )}
      {foundOpen && (
        <FoundItModal item={item} close={() => setFoundOpen(false)} />
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
function RelatedItems({ item }: { item: Item }) {
  const lost = item.type === "LOST";
  const related = useResource<Item[]>("/items", {
    limit: 5,
    category: item.categoryId,
    ...(lost ? { type: "FOUND" } : {}),
  });
  const list = (related.data?.data ?? [])
    .filter((other) => other.id !== item.id)
    .slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="related" aria-labelledby="related-title">
      <div className="section-row">
        <h2 id="related-title">
          {lost ? "Đồ nhặt được gần giống" : "Tin khác cùng danh mục"}
        </h2>
        <Link
          className="link-more"
          to={`/kham-pha?category=${item.categoryId}${lost ? "&type=FOUND" : ""}`}
        >
          Xem thêm <Icon name="arrow" width="16" height="16" />
        </Link>
      </div>
      <div className="item-grid four">
        {list.map((other) => (
          <ItemCard key={other.id} item={other} />
        ))}
      </div>
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
