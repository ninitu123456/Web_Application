import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorText, invalidate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useChat } from "../lib/chat";
import { useResource } from "../lib/hooks";
import type { Claim, Item, User, UserStats } from "../lib/types";
import { AccountShell } from "../components/AccountShell";
import { Icon } from "../components/Icon";
import {
  Button,
  Input,
  ItemCard,
  useToast,
  Loading,
  ErrorState,
  EmptyState,
} from "../components/ui";
import {
  AiFoundCard,
  RecentChats,
  itemProgress,
} from "../components/OverviewWidgets";

export function ProfilePage() {
  return (
    <AccountShell hub>
      <Overview />
      <ProfileForm />
    </AccountShell>
  );
}

function Overview() {
  const mine = useResource<Item[]>("/items/mine", { limit: 100 });
  const claims = useResource<Claim[]>("/claims/mine", { limit: 50 });
  const chat = useChat();
  const summary = useResource<UserStats>("/users/me/stats");
  const totals = summary.data?.data;
  if (mine.loading || claims.loading) return <Loading />;
  if (mine.error || claims.error)
    return <ErrorState error={mine.error || claims.error} retry={invalidate} />;
  const items = mine.data?.data ?? [];
  const sent = claims.data?.data ?? [];
  const open = items.filter((item) => item.status === "OPEN").length;
  const pending = items.filter((item) => item.status === "CLAIM_PENDING");
  const handover = items.filter((item) => item.status === "CLAIMED");
  const returned = items.filter(
    (item) => item.type === "FOUND" && item.status === "RETURNED",
  ).length;
  const received =
    sent.filter((claim) => claim.status === "COMPLETED").length +
    items.filter((item) => item.type === "LOST" && item.status === "RETURNED")
      .length;
  const approved = sent.filter((claim) => claim.status === "APPROVED");
  const stats = [
    {
      icon: "box",
      tone: "blue",
      value: totals?.posts.active ?? open,
      label: "Tin đang mở",
      sub: `Trên tổng ${totals?.posts.total ?? items.length} tin đã đăng`,
    },
    {
      icon: "shield",
      tone: "amber",
      value: totals?.incomingPendingClaims ?? pending.length,
      label: "Yêu cầu chờ bạn duyệt",
      sub:
        (totals?.incomingPendingClaims ?? pending.length)
          ? "Cần bạn xem bằng chứng"
          : "Không có yêu cầu mới",
    },
    {
      icon: "smile",
      tone: "green",
      value: returned,
      label: "Đồ đã trả lại",
      sub: returned
        ? `Bạn đã giúp ${returned} người`
        : "Từ tin Nhặt được của bạn",
    },
    {
      icon: "check",
      tone: "violet",
      value: received,
      label: "Đồ đã nhận lại",
      sub: "Từ yêu cầu và tin Bị mất của bạn",
    },
  ] as const;
  const todos = [
    ...pending.map((item) => ({
      icon: "shield" as const,
      tone: "amber",
      title: "Có yêu cầu nhận lại đang chờ bạn duyệt",
      sub: item.title,
      to: `/do-vat/${item.id}?tab=claims#received-claims`,
      action: "Duyệt ngay",
    })),
    ...handover.map((item) => ({
      icon: "check" as const,
      tone: "violet",
      title: `Hoàn tất bàn giao “${item.title}”`,
      sub: "Xác nhận khi đã trao đồ cho đúng người",
      to: `/do-vat/${item.id}?tab=claims#received-claims`,
      action: "Xem yêu cầu",
    })),
    ...approved.map((claim) => ({
      icon: "message" as const,
      tone: "blue",
      title: `Yêu cầu “${claim.item?.title ?? `#${claim.itemId}`}” đã được chấp thuận`,
      sub: "Nhắn tin để hẹn thời gian nhận đồ",
      to: `/do-vat/${claim.itemId}#contact-action`,
      action: "Liên hệ",
    })),
  ];
  return (
    <>
      <div className="stat-grid">
        {stats.map((stat) => (
          <div className={`v3-card stat-card ${stat.tone}`} key={stat.label}>
            <span className="stat-icon">
              <Icon name={stat.icon} width="22" height="22" />
            </span>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
            <small>{stat.sub}</small>
          </div>
        ))}
      </div>
      {totals && (
        <p className="overview-meta">
          <span>
            <Icon name="eye" width="16" height="16" />{" "}
            <strong>{totals.totalViews}</strong> lượt xem tin của bạn
          </span>
          <Link to="/da-luu">
            <Icon name="heart" width="16" height="16" />{" "}
            <strong>{totals.savedItems}</strong> tin đã lưu
          </Link>
          <span>
            <Icon name="send" width="16" height="16" />{" "}
            <strong>{totals.claims.sent}</strong> yêu cầu đã gửi
          </span>
        </p>
      )}
      <div className="overview-grid">
        <section className="v3-card todo-card" aria-labelledby="todo-title">
          <h2 id="todo-title">Việc cần làm</h2>
          {todos.length ? (
            <ul>
              {todos.map((todo) => (
                <li key={todo.to + todo.title}>
                  <span className={`todo-icon ${todo.tone}`}>
                    <Icon name={todo.icon} />
                  </span>
                  <div>
                    <strong>{todo.title}</strong>
                    <small>{todo.sub}</small>
                  </div>
                  <Link className="button secondary" to={todo.to}>
                    {todo.action}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Không có việc nào đang chờ bạn. Tuyệt vời!</p>
          )}
        </section>
        <div className="overview-side">
          <AiFoundCard items={items} />
          <RecentChats revision={chat.revision} />
          <aside className="v3-card quick-card">
            <h2>Lối tắt</h2>
            <Link to="/tin-nhan">
              <Icon name="message" /> Tin nhắn
              {chat.unread > 0 && (
                <span className="tab-count">{chat.unread}</span>
              )}
            </Link>
            <Link to="/da-luu">
              <Icon name="heart" /> Tin đã lưu
            </Link>
            <Link to="/dang-bai/tim-truoc">
              <Icon name="search" /> Tôi bị mất đồ
            </Link>
            <Link to="/dang-bai?type=FOUND">
              <Icon name="box" /> Tôi nhặt được đồ
            </Link>
          </aside>
        </div>
      </div>
      <section className="overview-items" aria-labelledby="mine-title">
        <div className="section-row">
          <h2 id="mine-title">Đồ của tôi</h2>
          <Link className="link-more" to="/bai-dang-cua-toi">
            Xem tất cả <Icon name="arrow" width="16" height="16" />
          </Link>
        </div>
        {items.length ? (
          <div className="item-grid four">
            {items.slice(0, 4).map((item) => (
              <ItemCard item={item} key={item.id} note={itemProgress(item)} />
            ))}
          </div>
        ) : (
          <EmptyState title="Bạn chưa đăng tin nào">
            <Link to="/dang-bai">Đăng tin đầu tiên</Link>
          </EmptyState>
        )}
      </section>
    </>
  );
}

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const current = useResource<User>("/users/me");
  useEffect(() => {
    if (current.data) {
      setName(current.data.data.fullName);
      updateUser(current.data.data);
    }
  }, [current.data, updateUser]);
  const [name, setName] = useState(user?.fullName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!name.trim() || Array.from(name.trim()).length > 150) {
      setError("Họ tên cần từ 1 đến 150 ký tự.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<User>("/users/me", {
        method: "PATCH",
        body: { fullName: name.trim() },
      });
      updateUser(result.data);
      setName(result.data.fullName);
      invalidate();
      toast("Đã cập nhật họ tên.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="v3-card settings-card"
      id="cai-dat"
      aria-labelledby="settings-title"
    >
      <h2 id="settings-title">Cài đặt tài khoản</h2>
      <form onSubmit={save} className="settings-form">
        <Input
          label="Họ và tên"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          autoComplete="name"
        />
        <Input
          label="Email trường (không đổi được)"
          value={user?.email || ""}
          readOnly
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <Link className="button secondary" to="/quen-mat-khau">
            Đổi mật khẩu
          </Link>
          <Button disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</Button>
        </div>
      </form>
    </section>
  );
}
