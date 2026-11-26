import { Link } from "react-router-dom";
import {
  progressSteps,
  type ConversationContext,
} from "../lib/conversation-context";
import { Icon } from "./Icon";
import { ItemImage, StatusBadge } from "./ui";

/** Right-hand column of Messages: what the two people are trading. */
export function ChatSide({
  context,
  active,
  select,
}: {
  context: ConversationContext | undefined;
  active: number;
  select: (index: number) => void;
}) {
  if (!context) return <aside className="panel chat-side" aria-busy="true" />;
  const thread = context.threads[active];
  if (!thread)
    return (
      <aside className="panel chat-side" aria-label="Thông tin trao đổi">
        <div className="chat-side-empty">
          <span className="handover-icon">
            <Icon name="box" />
          </span>
          <strong>Chưa gắn với tin đăng nào</strong>
          <p className="muted">
            Khi một trong hai bạn gửi yêu cầu nhận lại hoặc báo nhặt được đồ,
            tin đăng và tiến trình trao đồ sẽ hiện ở đây.
          </p>
          <Link className="button secondary" to="/kham-pha">
            Khám phá tin đăng
          </Link>
        </div>
      </aside>
    );
  const { item } = thread;
  const steps = progressSteps(thread);
  const roleText =
    thread.role === "OWNER"
      ? "Tin của bạn"
      : thread.role === "CLAIMANT"
        ? "Bạn đang nhận lại món này"
        : "Bạn báo đã nhặt được";
  return (
    <aside className="panel chat-side" aria-label="Thông tin trao đổi">
      {context.threads.length > 1 && (
        <div
          className="chat-side-switch"
          role="tablist"
          aria-label="Tin liên quan"
        >
          {context.threads.map((row, index) => (
            <button
              key={`${row.item.id}-${row.claim?.id ?? "m"}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => select(index)}
            >
              {row.item.title}
            </button>
          ))}
        </div>
      )}
      <div className="chat-side-item">
        <div className="chat-side-image">
          <ItemImage
            src={item.imageUrl ?? undefined}
            title={item.title}
            category={item.category}
          />
        </div>
        <div className="chat-side-body">
          <div className="badges">
            <StatusBadge status={item.type} group="itemType" />
            {thread.claim ? (
              <StatusBadge status={thread.claim.status} group="claim" />
            ) : (
              <StatusBadge status={item.status} group="item" />
            )}
          </div>
          <h3>{item.title}</h3>
          <p className="muted">
            {roleText} · {item.location}
          </p>
          <Link className="button secondary" to={`/do-vat/${item.id}`}>
            Xem tin
          </Link>
        </div>
      </div>
      <div className="chat-progress">
        <strong>Tiến trình trao đồ</strong>
        <ol>
          {steps.map((step) => (
            <li key={step.label} className={step.state}>
              <span className="dot" aria-hidden="true">
                {step.state === "done" && (
                  <Icon name="check" width="12" height="12" />
                )}
              </span>
              <span>
                {step.label}
                {step.hint && <small>{step.hint}</small>}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="chat-side-tip">
        <Icon name="shield" width="16" height="16" /> Hẹn ở nơi công cộng trong
        trường, không chuyển tiền hay gửi mã OTP.
      </p>
    </aside>
  );
}
