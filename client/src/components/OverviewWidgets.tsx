import { Link } from "react-router-dom";
import { useResource } from "../lib/hooks";
import type { Conversation } from "../lib/chat";
import type { Item, SuggestionsData } from "../lib/types";
import { Icon } from "./Icon";
import { ItemImage } from "./ui";

const BAND: Record<string, string> = {
  VERY_HIGH: "Rất giống",
  HIGH: "Khá giống",
  MEDIUM: "Có thể liên quan",
};
/** Best AI match for the user's newest open LOST post. */
export function AiFoundCard({ items }: { items: Item[] }) {
  const lost = items.find(
    (item) => item.type === "LOST" && item.status === "OPEN",
  );
  const result = useResource<SuggestionsData>(
    lost ? `/items/${lost.id}/suggestions` : null,
    { page: 1, limit: 3, visual: "true" },
  );
  if (!lost) return null;
  const data = result.data?.data;
  const best = data?.visual[0] ?? data?.information[0];
  return (
    <section className="v3-card ai-found-card" aria-labelledby="ai-found-title">
      <h2 id="ai-found-title">
        <Icon name="sparkle" width="18" height="18" /> AI vừa tìm thấy
      </h2>
      {result.loading ? (
        <p className="muted" role="status">
          Đang so khớp…
        </p>
      ) : best ? (
        <Link className="ai-found-row" to={`/do-vat/${best.item.id}`}>
          <span className="ai-found-thumb">
            <ItemImage
              src={best.item.images[0]?.url}
              title={best.item.title}
              category={best.item.category?.name}
            />
          </span>
          <span>
            <strong>{best.item.title}</strong>
            <small>
              {best.similarityBand
                ? BAND[best.similarityBand]
                : "Trùng thông tin"}{" "}
              với “{lost.title}” · {best.item.location?.name}
            </small>
          </span>
          <Icon name="arrow" width="16" height="16" />
        </Link>
      ) : (
        <p className="muted">
          Chưa có tin Nhặt được nào giống “{lost.title}”. FindIt sẽ tiếp tục so
          khớp khi có tin mới.
        </p>
      )}
    </section>
  );
}

const ago = (value: string | null) => {
  if (!value) return "";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ`;
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
};
export function RecentChats({ revision }: { revision: number }) {
  const result = useResource<Conversation[]>(
    "/conversations",
    { limit: 3 },
    revision,
  );
  const rows = result.data?.data ?? [];
  return (
    <section
      className="v3-card recent-chats"
      aria-labelledby="recent-chats-title"
    >
      <div className="section-row">
        <h2 id="recent-chats-title">Tin nhắn gần đây</h2>
        <Link className="link-more" to="/tin-nhan">
          Xem tất cả
        </Link>
      </div>
      {rows.length ? (
        <ul>
          {rows.map((chat) => (
            <li key={chat.id}>
              <Link to={`/tin-nhan?hoi-thoai=${chat.id}`}>
                <span className="avatar" aria-hidden="true">
                  {chat.peer.fullName
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("vi")}
                </span>
                <span className="recent-body">
                  <strong>{chat.peer.fullName}</strong>
                  <small>{chat.lastMessage || "Bắt đầu cuộc trò chuyện"}</small>
                </span>
                <span className="recent-meta">
                  <small>{ago(chat.lastMessageAt)}</small>
                  {chat.unreadCount > 0 && <i aria-label="Chưa đọc" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          {result.loading ? "Đang tải…" : "Chưa có cuộc trò chuyện nào."}
        </p>
      )}
    </section>
  );
}

/** One-line status under each of the user's own cards. */
export function itemProgress(item: Item) {
  switch (item.status) {
    case "CLAIM_PENDING":
      return "Có yêu cầu chờ bạn duyệt";
    case "CLAIMED":
      return "Đã duyệt, chờ bàn giao";
    case "RETURNED":
      return item.type === "FOUND" ? "Đã trao lại chủ" : "Đã nhận lại đồ";
    case "CLOSED":
      return "Đã đóng tin";
    default:
      return item.type === "LOST"
        ? "Đang tìm, AI so khớp mỗi ngày"
        : "Đang chờ chủ nhận";
  }
}
