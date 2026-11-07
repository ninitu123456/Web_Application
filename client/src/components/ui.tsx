import { Icon } from "./Icon";
import { statusLabel, type StatusGroup } from "../lib/display-labels";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { errorText } from "../lib/api";
import type { Item, PaginationData } from "../lib/types";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return <button className={`button ${variant} ${className}`} {...props} />;
}
export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className={`field ${props.type === "file" ? "upload-field" : ""}`}>
      <label htmlFor={id}>
        {props.type === "file" && <Icon name="image" width="28" height="28" />}
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <small id={`${id}-error`} className="error-text">
          {error}
        </small>
      )}
    </div>
  );
}
export function Select({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        {children}
      </select>
      {error && (
        <small id={`${id}-error`} className="error-text">
          {error}
        </small>
      )}
    </div>
  );
}
export function Textarea({
  label,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <small id={`${id}-error`} className="error-text">
          {error}
        </small>
      )}
    </div>
  );
}
export function StatusBadge({
  status,
  group,
}: {
  status: string;
  group: StatusGroup;
}) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      {statusLabel(status, group)}
    </span>
  );
}
export function dateLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
export function ItemImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div
      className="image-fallback"
      role="img"
      aria-label={`${title} — chưa có ảnh`}
    >
      <Icon name="image" width="40" height="40" />
      <small>Chưa có hình ảnh</small>
    </div>
  );
}
export function ItemCard({ item }: { item: Item }) {
  const location = useLocation();
  const state =
    location.pathname === "/"
      ? { exploreFrom: `/${location.search}` }
      : undefined;
  return (
    <article className="item-card">
      <Link className="card-image" to={`/do-vat/${item.id}`} state={state}>
        <ItemImage src={item.images[0]?.url} title={item.title} />
      </Link>
      <div className="card-content">
        <StatusBadge status={item.type} group="itemType" />
        {item.visibility === "HIDDEN" && (
          <span className="badge">Đã gỡ khỏi công khai</span>
        )}
        <div className="card-meta">
          <span>{item.category?.name || "Đồ vật"}</span>
          <StatusBadge status={item.status} group="item" />
        </div>
        <h3>
          <Link to={`/do-vat/${item.id}`} state={state}>
            {item.title}
          </Link>
        </h3>
        <p className="muted">
          <Icon name="pin" />{" "}
          {item.location?.name || `Địa điểm #${item.locationId}`}
        </p>
        <div className="card-bottom">
          <span>
            <Icon name="calendar" /> {dateLabel(item.eventDate)}
          </span>
          <Link
            aria-label={`Xem ${item.title}`}
            to={`/do-vat/${item.id}`}
            state={state}
          >
            <Icon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Loading() {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      Đang tải dữ liệu…
    </div>
  );
}
export function EmptyState({
  title = "Chưa có nội dung",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon name="search" width="40" height="40" />
      </span>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="state error-state" role="alert">
      <h3>Chưa thể tải nội dung</h3>
      <p>{errorText(error)}</p>
      {retry && (
        <Button type="button" variant="secondary" onClick={retry}>
          Thử tải lại
        </Button>
      )}
    </div>
  );
}
export function Pagination({
  data,
  change,
}: {
  data?: PaginationData;
  change: (page: number) => void;
}) {
  if (!data || data.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Phân trang">
      <Button
        variant="secondary"
        disabled={data.page <= 1}
        onClick={() => change(data.page - 1)}
      >
        ← Trước
      </Button>
      <span>
        Trang {data.page} / {data.totalPages}
      </span>
      <Button
        variant="secondary"
        disabled={data.page >= data.totalPages}
        onClick={() => change(data.page + 1)}
      >
        Sau →
      </Button>
    </nav>
  );
}
export function Modal({
  title,
  children,
  close,
  busy = false,
  className,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className={className}
      ref={dialog}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) close();
      }}
    >
      <div className="modal-inner">
        <div className="section-heading">
          <h2 id={heading}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Đóng hộp thoại"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function ConfirmDialog({
  title,
  children,
  confirm,
  close,
  busy,
}: {
  title: string;
  children: ReactNode;
  confirm: () => void;
  close: () => void;
  busy: boolean;
}) {
  return (
    <Modal title={title} close={close} busy={busy}>
      <p>{children}</p>
      <div className="actions">
        <Button variant="secondary" disabled={busy} onClick={close}>
          Hủy
        </Button>
        <Button disabled={busy} onClick={confirm}>
          {busy ? "Đang xử lý…" : "Xác nhận"}
        </Button>
      </div>
    </Modal>
  );
}
interface Notice {
  id: number;
  text: string;
  error: boolean;
}
const ToastContext = createContext<(text: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = (text: string, error = false) => {
    const id = ++next.current;
    setNotices((old) => [...old, { id, text, error }]);
    timers.current.push(
      setTimeout(
        () => setNotices((old) => old.filter((notice) => notice.id !== id)),
        error ? 15000 : 6500,
      ),
    );
  };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {notices.map((notice) => (
          <div
            className={`toast ${notice.error ? "toast-error" : ""}`}
            key={notice.id}
          >
            <span>{notice.text}</span>
            <button
              aria-label="Đóng thông báo"
              onClick={() =>
                setNotices((old) => old.filter((item) => item.id !== notice.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
