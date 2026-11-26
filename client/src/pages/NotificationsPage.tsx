import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  notificationRoute,
  navigableNotifications,
  type NotificationTarget,
} from "../lib/notification-navigation";
import { api, errorText, invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useNotifications } from "../lib/notifications";
import type { Notification } from "../lib/extended-types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  useToast,
} from "../components/ui";
export function NotificationsPage() {
  const navigate = useNavigate();
  async function open(notification: Notification) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api<NotificationTarget>(
        `/notifications/${notification.id}/target`,
      );
      navigate(notificationRoute(data, notification.id));
    } catch (error) {
      setError(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const [params, setParams] = useSearchParams();
  const notifications = useNotifications();
  useEffect(() => {
    notifications.refresh();
  }, [notifications.refresh]);
  const filter = params.get("loc") || "";
  const result = useResource<Notification[]>(
    "/notifications",
    { page: params.get("page") || "1", limit: 15, filter: filter || undefined },
    notifications.revision,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function mark(id?: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(id ? `/notifications/${id}/read` : "/notifications/read-all", {
        method: "PATCH",
      });
      toast(
        id
          ? "Đã đánh dấu thông báo là đã đọc."
          : "Đã đánh dấu tất cả là đã đọc.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
      invalidate();
    }
  }
  return (
    <section className="page-section narrow">
      <div className="section-heading">
        <div>
          <h1>Thông báo</h1>
          <p className="muted">
            {notifications.error
              ? "Chưa tải được số thông báo chưa đọc."
              : notifications.loading
                ? "Đang tải số thông báo…"
                : `${notifications.count} thông báo chưa đọc`}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy || notifications.loading || notifications.count === 0}
          onClick={() => void mark()}
        >
          Đánh dấu tất cả đã đọc
        </Button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div
        className="segmented notification-tabs"
        role="tablist"
        aria-label="Lọc thông báo"
      >
        {NOTIFICATION_TABS.map(([key, label]) => (
          <button
            key={key || "all"}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setParams(key ? { loc: key } : {})}
          >
            {label}
            {key === "unread" &&
              notifications.count > 0 &&
              ` · ${notifications.count}`}
          </button>
        ))}
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="notification-card">
          {groupByDay(result.data.data).map(([label, rows]) => (
            <section key={label} aria-label={label}>
              <h2>{label}</h2>
              {rows.map((notification) => {
                const look = notificationLook(notification.type);
                return (
                  <article
                    data-notification-id={notification.id}
                    key={notification.id}
                    className={`notification-row ${notification.isRead ? "" : "unread"}`}
                  >
                    <span className={`notification-icon ${look.tone}`}>
                      <Icon name={look.icon} width="18" height="18" />
                    </span>
                    <div className="notification-body">
                      {navigableNotifications.has(notification.type) ? (
                        <button
                          type="button"
                          className="notification-open"
                          disabled={busy}
                          onClick={() => void open(notification)}
                        >
                          <span>{notification.message}</span>
                          <span className="notification-cta">
                            {notification.type === "CLAIM_APPROVED"
                              ? "Xem yêu cầu đã duyệt →"
                              : "Xem nội dung thông báo →"}
                          </span>
                        </button>
                      ) : (
                        <p>{notification.message}</p>
                      )}
                      <small className="muted">
                        {relative(notification.createdAt)}
                      </small>
                    </div>
                    {notification.isRead ? (
                      <span className="sr-only">Đã đọc</span>
                    ) : (
                      <button
                        type="button"
                        className="notification-mark"
                        disabled={busy}
                        aria-label="Đánh dấu đã đọc"
                        title="Đánh dấu đã đọc"
                        onClick={() => void mark(notification.id)}
                      >
                        <i aria-hidden="true" />
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            filter
              ? "Không có thông báo trong mục này"
              : "Bạn chưa có thông báo"
          }
        />
      )}
      <Pagination
        data={result.data?.pagination}
        change={(page) =>
          setParams(
            filter
              ? { loc: filter, page: String(page) }
              : { page: String(page) },
          )
        }
      />
    </section>
  );
}

const NOTIFICATION_TABS = [
  ["", "Tất cả"],
  ["unread", "Chưa đọc"],
  ["match", "AI ghép cặp"],
  ["claim", "Yêu cầu & trao đồ"],
  ["system", "Hệ thống"],
] as const;
function notificationLook(type: string): {
  icon: "sparkle" | "shield" | "check" | "close" | "flag" | "bell";
  tone: string;
} {
  if (type === "NEW_MATCH" || type === "AI_VISUAL_SIMILAR_ITEM")
    return { icon: "sparkle", tone: "violet" };
  if (type === "CLAIM_COMPLETED") return { icon: "check", tone: "green" };
  if (type === "CLAIM_REJECTED") return { icon: "close", tone: "red" };
  if (type.startsWith("CLAIM")) return { icon: "shield", tone: "amber" };
  if (type.startsWith("REPORT")) return { icon: "flag", tone: "blue" };
  return { icon: "bell", tone: "blue" };
}
function groupByDay(rows: Notification[]) {
  const today = new Date().toDateString();
  const groups: [string, Notification[]][] = [];
  for (const row of rows) {
    const label =
      new Date(row.createdAt).toDateString() === today ? "Hôm nay" : "Trước đó";
    const last = groups.at(-1);
    if (last && last[0] === label) last[1].push(row);
    else groups.push([label, [row]]);
  }
  return groups;
}
function relative(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ trước`;
  return dateLabel(value);
}
