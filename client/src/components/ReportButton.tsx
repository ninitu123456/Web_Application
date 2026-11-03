import { useRef, useState, type FormEvent } from "react";
import { api, errorText, invalidate } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ReportTarget } from "../lib/extended-types";
import { Button, Input, Modal, Textarea, useToast } from "./ui";
export function ReportButton({
  targetType,
  targetId,
  label = "Báo cáo vi phạm",
}: {
  targetType: ReportTarget;
  targetId: number;
  label?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return user ? (
    <>
      <Button
        variant="secondary"
        className="report-button"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <ReportModal
          targetType={targetType}
          targetId={targetId}
          close={() => setOpen(false)}
        />
      )}
    </>
  ) : null;
}
function ReportModal({
  targetType,
  targetId,
  close,
}: {
  targetType: ReportTarget;
  targetId: number;
  close: () => void;
}) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!reason.trim() || Array.from(reason.trim()).length > 50) {
      setError("Vui lòng nhập lý do báo cáo, tối đa 50 ký tự.");
      return;
    }
    if (new TextEncoder().encode(description.trim()).length > 65535) {
      setError("Mô tả quá dài. Vui lòng rút ngắn.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/reports", {
        method: "POST",
        body: {
          targetType,
          targetId,
          reason: reason.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      toast("Đã gửi báo cáo để quản trị viên xem xét.");
      invalidate();
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="Gửi báo cáo vi phạm" close={close} busy={busy}>
      <p className="muted">
        Đối tượng:{" "}
        {targetType === "ITEM"
          ? "Bài đăng"
          : targetType === "USER"
            ? "Tài khoản"
            : "Yêu cầu nhận đồ"}{" "}
        #{targetId}. Báo cáo sẽ được quản trị viên xem xét; việc gửi báo cáo
        không tự động đóng bài, thay đổi yêu cầu nhận đồ hoặc đình chỉ tài
        khoản.
      </p>
      <form onSubmit={submit}>
        <Input
          label="Lý do báo cáo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          disabled={busy}
        />
        <Textarea
          label="Mô tả thêm (tùy chọn)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
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
            {busy ? "Đang gửi…" : "Gửi báo cáo →"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
