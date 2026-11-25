import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorText } from "../lib/api";
import type { Item } from "../lib/types";
import { Button, Input, Modal, Textarea } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);
export function foundMessage(
  item: Item,
  place: string,
  date: string,
  note: string,
) {
  const day = date.split("-").reverse().join("/");
  return [
    `Chào bạn, mình nghĩ mình đã nhặt được “${item.title}” (tin #${item.id}).`,
    `Nơi nhặt: ${place}`,
    `Ngày nhặt: ${day}`,
    note ? `Ghi chú: ${note}` : "",
    "Bạn mô tả thêm đặc điểm để mình xác nhận rồi hẹn trả nhé.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lets a finder answer a LOST post by opening a private chat with its owner. */
export function FoundItModal({
  item,
  close,
}: {
  item: Item;
  close: () => void;
}) {
  const navigate = useNavigate();
  const [place, setPlace] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!place.trim()) {
      setError("Vui lòng cho biết bạn nhặt được ở đâu.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const chat = await api<{ id: string }>("/conversations", {
        method: "POST",
        body: { userId: item.userId },
      });
      await api(`/conversations/${chat.data.id}/messages`, {
        method: "POST",
        body: {
          clientId: crypto.randomUUID(),
          content: foundMessage(item, place.trim(), date, note.trim()),
        },
      });
      navigate(`/tin-nhan?hoi-thoai=${chat.data.id}`);
    } catch (e) {
      setError(errorText(e));
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Báo cho chủ đồ"
      close={close}
      busy={busy}
      dismissible={!place.trim() && !note.trim()}
    >
      <p className="muted">
        FindIt gửi tin nhắn riêng tới người đăng. Đừng gửi ảnh hay đặc điểm
        riêng của món đồ; hãy để chủ đồ tự mô tả để xác minh.
      </p>
      <form onSubmit={submit}>
        <Input
          label="Nơi bạn nhặt được"
          value={place}
          maxLength={200}
          placeholder="Ví dụ: Thư viện tầng 2, bàn gần cửa sổ"
          onChange={(e) => setPlace(e.target.value)}
          required
          disabled={busy}
        />
        <Input
          label="Ngày nhặt"
          type="date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          required
          disabled={busy}
        />
        <Textarea
          label="Lời nhắn (không bắt buộc)"
          rows={3}
          maxLength={1200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </Button>
          <Button disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi cho chủ đồ →"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
