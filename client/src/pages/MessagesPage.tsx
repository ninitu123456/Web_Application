import { Icon } from "../components/Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useChat, type Conversation, type Message } from "../lib/chat";
import { Button } from "../components/ui";
import { ChatSide } from "../components/ChatSide";
import {
  HandoverPanel,
  type HandoverChange,
} from "../components/HandoverPanel";
import { useResource } from "../lib/hooks";
import {
  handoverMessage,
  type ConversationContext,
} from "../lib/conversation-context";
import type { Handover } from "../lib/types";
export function MessagesPage() {
  const { user } = useAuth(),
    { revision, connected } = useChat();
  const [params] = useSearchParams();
  const selected = params.get("hoi-thoai") || "";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [sending, setSending] = useState(false),
    [older, setOlder] = useState(false),
    [moreChats, setMoreChats] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const pending = useRef<{
    clientId: string;
    content: string;
    conversationId: string;
  } | null>(null);
  const lock = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    current = useRef(selected);
  const newest = useRef("");
  // Unsent text is kept per conversation while the page stays open.
  const drafts = useRef(new Map<string, string>());
  current.current = selected;
  const [contextRefresh, setContextRefresh] = useState(0);
  const [active, setActive] = useState(0);
  const [scheduleSignal, setScheduleSignal] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const contextResult = useResource<ConversationContext>(
    selected ? `/conversations/${selected}/context` : null,
    {},
    revision * 1000 + contextRefresh,
  );
  const context = contextResult.data?.data;
  const thread = context?.threads[active];
  const handoverThread =
    thread?.claim &&
    thread.handover &&
    (thread.role === "OWNER" || thread.role === "CLAIMANT")
      ? thread
      : undefined;
  const canSchedule =
    handoverThread?.claim?.status === "APPROVED" &&
    !handoverThread.handover?.ownerConfirmedAt &&
    !handoverThread.handover?.claimantConfirmedAt;
  async function postNote(content: string) {
    const id = current.current;
    if (!content || !id) return;
    try {
      const result = await api<Message>(`/conversations/${id}/messages`, {
        method: "POST",
        body: { clientId: crypto.randomUUID(), content },
      });
      if (current.current === id)
        setMessages((previous) =>
          previous.some((message) => message.id === result.data.id)
            ? previous
            : [...previous, result.data],
        );
    } catch {
      // The handover itself succeeded; the chat note is best effort.
    }
  }
  function handoverChanged(change: HandoverChange, handover: Handover) {
    setContextRefresh((value) => value + 1);
    if (handoverThread)
      void postNote(
        handoverMessage(change, handover, handoverThread.item.title),
      );
  }
  useEffect(() => {
    const controller = new AbortController();
    void api<Conversation[]>("/conversations", {
      query: { limit: 30 },
      signal: controller.signal,
    }).then(
      (result) => {
        setConversations((previous) => [
          ...result.data,
          ...previous.filter(
            (chat) => !result.data.some((latest) => latest.id === chat.id),
          ),
        ]);
        setMoreChats(result.data.length === 30);
        setLoading(false);
      },
      (e) => {
        if (!controller.signal.aborted) {
          setError(errorText(e));
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setMessages([]);
    setOlder(false);
    newest.current = "";
    setText(drafts.current.get(selected) || "");
    setError("");
    setActive(0);
    setContextOpen(false);
    pending.current = null;
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const synchronize = async () => {
      const rows: Message[] = [];
      let after = newest.current;
      const initial = !after;
      do {
        const result = await api<Message[]>(
          `/conversations/${selected}/messages`,
          {
            query: after ? { after, limit: 100 } : {},
            signal: controller.signal,
          },
        );
        const batch = after ? result.data : result.data.slice().reverse();
        rows.push(...batch);
        if (initial) {
          setOlder(result.data.length === 30);
          break;
        }
        if (batch.length < 100) break;
        after = batch.at(-1)!.id;
      } while (!controller.signal.aborted);
      if (controller.signal.aborted) return;
      if (rows.length) newest.current = rows.at(-1)!.id;
      setMessages((previous) => {
        const map = new Map(previous.map((message) => [message.id, message]));
        rows.forEach((message) => map.set(message.id, message));
        return [...map.values()].sort((a, b) =>
          BigInt(a.id) < BigInt(b.id) ? -1 : 1,
        );
      });
      if (document.visibilityState === "visible" && newest.current)
        void api(`/conversations/${selected}/read`, {
          method: "POST",
          body: { messageId: newest.current },
          signal: controller.signal,
        }).catch(() => {});
    };
    void synchronize().catch((e) => {
      if (!controller.signal.aborted) setError(errorText(e));
    });
    return () => controller.abort();
  }, [selected, revision]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [selected, messages.at(-1)?.id]);
  async function loadOlder() {
    if (historyBusy || !messages.length) return;
    const id = selected;
    setHistoryBusy(true);
    try {
      const result = await api<Message[]>(`/conversations/${id}/messages`, {
        query: { before: messages[0].id },
      });
      if (current.current !== id) return;
      setMessages((previous) => {
        const map = new Map(
          [...result.data.slice().reverse(), ...previous].map((message) => [
            message.id,
            message,
          ]),
        );
        return [...map.values()];
      });
      setOlder(result.data.length === 30);
    } catch (e) {
      if (current.current === id) setError(errorText(e));
    } finally {
      setHistoryBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !text.trim() || !selected) return;
    if (Array.from(text.trim()).length > 2000) {
      setError("Tin nhắn tối đa 2000 ký tự.");
      return;
    }
    const id = selected;
    lock.current = true;
    setSending(true);
    setError("");
    if (
      !pending.current ||
      pending.current.content !== text.trim() ||
      pending.current.conversationId !== id
    )
      pending.current = {
        clientId: crypto.randomUUID(),
        content: text.trim(),
        conversationId: id,
      };
    const payload = pending.current;
    try {
      const result = await api<Message>(`/conversations/${id}/messages`, {
        method: "POST",
        body: payload,
      });
      if (current.current !== id) return;
      setMessages((previous) =>
        previous.some((message) => message.id === result.data.id)
          ? previous
          : [...previous, result.data],
      );
      drafts.current.delete(id);
      if (current.current === id) setText("");
      pending.current = null;
    } catch (e) {
      if (current.current === id) setError(errorText(e));
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  async function loadChats() {
    try {
      const result = await api<Conversation[]>("/conversations", {
        query: { before: conversations.at(-1)?.id, limit: 30 },
      });
      setConversations((previous) => [
        ...previous,
        ...result.data.filter(
          (row) => !previous.some((existing) => existing.id === row.id),
        ),
      ]);
      setMoreChats(result.data.length === 30);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const frame = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let scheduled = 0;
    const measure = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const bottom =
          (viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0);
        const nav = document.querySelector<HTMLElement>(".bottom-nav");
        const box = nav?.getBoundingClientRect();
        const availableBottom =
          box && box.height > 0 ? Math.min(bottom, box.top) : bottom;
        const height = Math.max(
          120,
          availableBottom - element.getBoundingClientRect().top - 16,
        );
        element.style.setProperty("--chat-height", height + "px");
        element.dataset.compact = String(height < 420);
      });
    };
    const observer = new ResizeObserver(measure);
    const header = document.querySelector(".header");
    if (header) observer.observe(header);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    measure();
    return () => {
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [selected, contextOpen]);
  const peer = conversations.find((chat) => chat.id === selected)?.peer;
  return (
    <section ref={frame} className="page-section messages-page">
      <div className="page-heading">
        <h1>Tin nhắn</h1>
        <p className="muted" role="status">
          {connected
            ? "Trao đổi và hẹn giờ trao đồ ngay tại đây."
            : "Đang kết nối lại… Tin nhắn sẽ tự đồng bộ."}
        </p>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`chat-layout ${selected ? "chat-selected has-side" : ""}${contextOpen ? " context-open" : ""}`}
      >
        <aside
          className="panel chat-list"
          aria-label="Danh sách cuộc trò chuyện"
        >
          {loading ? (
            <p role="status">Đang tải hội thoại…</p>
          ) : !conversations.length ? (
            <p className="muted">
              Chưa có cuộc trò chuyện. Mở bài đăng và chọn “Nhắn tin” để bắt
              đầu.
            </p>
          ) : (
            conversations.map((chat) => (
              <Link
                key={chat.id}
                className={`chat-preview ${chat.id === selected ? "active" : ""}`}
                to={`/tin-nhan?hoi-thoai=${chat.id}`}
              >
                <span className="avatar" aria-hidden="true">
                  {chat.peer.fullName
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("vi")}
                </span>
                <span className="preview-body">
                  <span className="preview-top">
                    <strong>{chat.peer.fullName}</strong>
                    <small>{shortTime(chat.lastMessageAt)}</small>
                  </span>
                  <span className="preview-text">
                    {chat.lastMessage || "Bắt đầu cuộc trò chuyện"}
                  </span>
                </span>
                {chat.unreadCount > 0 && (
                  <b
                    className="tab-count"
                    aria-label={`${chat.unreadCount} chưa đọc`}
                  >
                    {chat.unreadCount}
                  </b>
                )}
              </Link>
            ))
          )}
          {moreChats && (
            <Button variant="secondary" onClick={loadChats}>
              Xem thêm hội thoại
            </Button>
          )}
        </aside>
        <div className="panel chat-main">
          {!selected ? (
            <div className="state">
              Chọn một cuộc trò chuyện để xem tin nhắn.
            </div>
          ) : (
            <>
              <header className="chat-heading">
                <Link className="chat-back" to="/tin-nhan">
                  ← Hội thoại
                </Link>
                <span className="avatar" aria-hidden="true">
                  {(peer?.fullName || "?")
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("vi")}
                </span>
                <div>
                  <h2>{peer?.fullName || "Cuộc trò chuyện"}</h2>
                  <small className={connected ? "online" : "offline"}>
                    {connected ? "● Đã kết nối" : "● Đang kết nối lại…"}
                  </small>
                </div>
                <button
                  type="button"
                  className="chat-context-toggle icon-button"
                  aria-label={
                    contextOpen
                      ? "Đóng thông tin trao đổi"
                      : "Mở thông tin trao đổi"
                  }
                  aria-expanded={contextOpen}
                  aria-controls="chat-context"
                  onClick={() => setContextOpen((value) => !value)}
                >
                  <Icon name={contextOpen ? "close" : "box"} />
                </button>
              </header>
              <div
                className="chat-history"
                role="log"
                aria-label="Lịch sử tin nhắn"
                aria-live="polite"
              >
                {older && messages.length > 0 && (
                  <Button
                    variant="secondary"
                    disabled={historyBusy}
                    onClick={loadOlder}
                  >
                    {historyBusy ? "Đang tải…" : "Tin nhắn cũ hơn"}
                  </Button>
                )}
                {!messages.length && (
                  <p className="muted">Chưa có tin nhắn. Hãy gửi lời chào!</p>
                )}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`chat-bubble ${message.senderId === String(user?.id) ? "mine" : ""}`}
                  >
                    <p>{message.content}</p>
                    <time dateTime={message.createdAt}>
                      {shortTime(message.createdAt)}
                    </time>
                  </article>
                ))}
                {handoverThread?.claim && (
                  <HandoverPanel
                    key={handoverThread.claim.id}
                    claimId={handoverThread.claim.id}
                    role={handoverThread.role as "OWNER" | "CLAIMANT"}
                    variant="chat"
                    openForm={scheduleSignal}
                    revision={revision}
                    onChanged={handoverChanged}
                  />
                )}
                <div ref={bottom} />
              </div>
              <form className="chat-compose" onSubmit={send}>
                {canSchedule && (
                  <button
                    type="button"
                    className="chat-tool"
                    onClick={() => {
                      setScheduleSignal((value) => value + 1);
                      requestAnimationFrame(() =>
                        bottom.current?.scrollIntoView({ block: "nearest" }),
                      );
                    }}
                  >
                    <Icon name="calendar" width="16" height="16" /> Đề xuất lịch
                    hẹn
                  </button>
                )}
                <label htmlFor="chat-message" className="sr-only">
                  Tin nhắn
                </label>
                <textarea
                  id="chat-message"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    drafts.current.set(selected, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Enter sends on desktop; Shift+Enter adds a new line.
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      window.matchMedia("(pointer: fine)").matches
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Nhập tin nhắn…"
                  rows={2}
                  maxLength={2000}
                  disabled={sending}
                />
                <Button
                  disabled={sending || !text.trim()}
                  aria-label={sending ? "Đang gửi" : "Gửi tin nhắn"}
                >
                  <Icon name="send" />
                </Button>
              </form>
            </>
          )}
        </div>
        {selected && (
          <div id="chat-context" className="chat-context">
            <ChatSide context={context} active={active} select={setActive} />
          </div>
        )}
      </div>
    </section>
  );
}

function shortTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
