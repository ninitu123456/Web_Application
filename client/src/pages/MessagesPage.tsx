import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useChat, type Conversation, type Message } from "../lib/chat";
import { Button } from "../components/ui";
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
  current.current = selected;
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
    setText("");
    setError("");
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
      setText("");
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
  const peer = conversations.find((chat) => chat.id === selected)?.peer;
  return (
    <section className="page-section">
      <div className="page-heading">
        <h1>Tin nhắn</h1>
        <p className="muted" role="status">
          {connected
            ? "Đã kết nối"
            : "Đang kết nối lại… Tin nhắn sẽ tự đồng bộ."}
        </p>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className={`chat-layout ${selected ? "chat-selected" : ""}`}>
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
                <strong>{chat.peer.fullName}</strong>
                <span>{chat.lastMessage || "Bắt đầu cuộc trò chuyện"}</span>
                <small>
                  {chat.lastMessageAt
                    ? new Date(chat.lastMessageAt).toLocaleString("vi-VN")
                    : ""}{" "}
                  {chat.unreadCount > 0 && <b>{chat.unreadCount} chưa đọc</b>}
                </small>
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
                <h2>{peer?.fullName || "Cuộc trò chuyện"}</h2>
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
                      {new Date(message.createdAt).toLocaleString("vi-VN")}
                    </time>
                  </article>
                ))}
                <div ref={bottom} />
              </div>
              <form className="chat-compose" onSubmit={send}>
                <label htmlFor="chat-message" className="sr-only">
                  Tin nhắn
                </label>
                <textarea
                  id="chat-message"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nhập tin nhắn…"
                  rows={2}
                  maxLength={4000}
                  disabled={sending}
                />
                <Button disabled={sending || !text.trim()}>
                  {sending ? "Đang gửi…" : "Gửi"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
