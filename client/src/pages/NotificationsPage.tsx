import { useEffect, useRef, useState } from "react";
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
  const result = useResource<Notification[]>(
    "/notifications",
    { page: params.get("page") || "1", limit: 10 },
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
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={invalidate} />
      ) : result.data?.data.length ? (
        <div className="stack">
          {result.data.data.map((notification) => (
            <article
              data-notification-id={notification.id}
              key={notification.id}
              className={`panel notification-row ${notification.isRead ? "" : "unread"}`}
            >
              <div>
                <span className="badge">
                  {notification.isRead ? "Đã đọc" : "Chưa đọc"}
                </span>
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
                  <>
                    <p>{notification.message}</p>
                    <small className="muted">
                      Thông báo này chưa có liên kết đích.
                    </small>
                  </>
                )}
                <small className="muted">
                  {dateLabel(notification.createdAt)}
                </small>
              </div>
              {!notification.isRead && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void mark(notification.id)}
                >
                  Đánh dấu đã đọc
                </Button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Bạn chưa có thông báo" />
      )}
      <Pagination
        data={result.data?.pagination}
        change={(page) => setParams({ page: String(page) })}
      />
    </section>
  );
}
