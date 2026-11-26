import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorText, invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Handover } from "../lib/types";
import { Icon } from "./Icon";
import { Button, Input, Textarea, useToast } from "./ui";

const when = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function localInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 86400000);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** Appointment, receipt confirmation and dispute for an approved Claim. */
export type HandoverChange = "proposed" | "accepted" | "confirmed" | "disputed";
export function HandoverPanel({
  claimId,
  role,
  variant = "panel",
  openForm = 0,
  revision = 0,
  onChanged,
}: {
  claimId: number;
  role: "OWNER" | "CLAIMANT";
  /** "chat" renders the compact card shown inside a conversation. */
  variant?: "panel" | "chat";
  /** Bump to open the appointment form from outside (chat composer). */
  openForm?: number;
  revision?: number;
  onChanged?: (change: HandoverChange, handover: Handover) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const result = useResource<Handover>(
    `/claims/${claimId}/handover`,
    {},
    refresh + revision * 1000,
  );
  const [editing, setEditing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [at, setAt] = useState("");
  const [place, setPlace] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const toast = useToast();
  const handover = result.data?.data;
  const loaded = Boolean(handover);
  useEffect(() => {
    if (!openForm || !loaded) return;
    setAt(localInput(handover?.appointment?.at));
    setPlace(handover?.appointment?.place ?? "");
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openForm, loaded]);
  if (!handover) return null;
  const mine = role === "OWNER" ? handover.ownerId : handover.claimantId;
  const appointment = handover.appointment;
  const openDispute = handover.dispute && !handover.dispute.resolvedAt;
  const done = handover.claimStatus === "COMPLETED";
  async function run(
    path: string,
    method: string,
    body?: unknown,
    message?: string,
    change?: HandoverChange,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api<Handover>(
        `/claims/${claimId}/handover${path}`,
        { method, body },
      );
      if (message) toast(message);
      if (change) onChanged?.(change, response.data);
      setRefresh((value) => value + 1);
      invalidate();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!at || !place.trim()) {
      setError("Vui lòng chọn thời gian và địa điểm hẹn.");
      return;
    }
    const time = new Date(at);
    if (Number.isNaN(time.getTime()) || time.getTime() <= Date.now()) {
      setError("Thời gian hẹn phải ở tương lai.");
      return;
    }
    if (
      await run(
        "/appointment",
        "PUT",
        { appointmentAt: time.toISOString(), place: place.trim() },
        "Đã gửi lịch hẹn cho bên còn lại.",
        "proposed",
      )
    )
      setEditing(false);
  }
  async function dispute(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Vui lòng mô tả sự cố.");
      return;
    }
    if (
      await run(
        "/dispute",
        "POST",
        { reason: reason.trim() },
        "Đã gửi khiếu nại tới ban quản trị.",
        "disputed",
      )
    ) {
      setDisputing(false);
      setReason("");
    }
  }
  const confirmed =
    role === "OWNER" ? handover.ownerConfirmedAt : handover.claimantConfirmedAt;
  const otherConfirmed =
    role === "OWNER" ? handover.claimantConfirmedAt : handover.ownerConfirmedAt;
  return (
    <section
      className={`handover-panel${variant === "chat" ? " handover-chat" : ""}`}
      aria-label="Bàn giao đồ vật"
    >
      <header>
        <span className="handover-icon">
          <Icon name="calendar" />
        </span>
        <div>
          <strong>Lịch hẹn bàn giao</strong>
          {appointment ? (
            <p>
              {when(appointment.at)} · {appointment.place}{" "}
              <span
                className={`badge ${appointment.status === "ACCEPTED" ? "status-claimed" : "status-claim_pending"}`}
              >
                {appointment.status === "ACCEPTED"
                  ? "Đã chốt"
                  : appointment.proposedBy === mine
                    ? "Chờ bên kia đồng ý"
                    : "Chờ bạn đồng ý"}
              </span>
            </p>
          ) : (
            <p className="muted">
              Chưa có lịch hẹn. Hãy hẹn nơi công cộng trong trường.
            </p>
          )}
        </div>
      </header>
      {openDispute && (
        <p className="notice" role="status">
          Đang có khiếu nại: “{handover.dispute!.reason}”. Ban quản trị sẽ liên
          hệ; xác nhận bàn giao tạm khóa.
        </p>
      )}
      {handover.dispute?.resolvedAt && !openDispute && (
        <p className="muted">Khiếu nại trước đã được ban quản trị xử lý.</p>
      )}
      {!done && !openDispute && (
        <div className="actions">
          {appointment?.status === "PROPOSED" &&
            appointment.proposedBy !== mine && (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    "/appointment/accept",
                    "PATCH",
                    undefined,
                    "Đã chốt lịch hẹn.",
                    "accepted",
                  )
                }
              >
                <Icon name="check" /> Đồng ý lịch hẹn
              </Button>
            )}
          {!handover.ownerConfirmedAt && !handover.claimantConfirmedAt && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setAt(localInput(appointment?.at));
                setPlace(appointment?.place ?? "");
                setEditing((value) => !value);
              }}
            >
              {appointment ? "Đổi lịch hẹn" : "Đề xuất lịch hẹn"}
            </Button>
          )}
          {role === "CLAIMANT" && !confirmed && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  "/confirm",
                  "PATCH",
                  undefined,
                  "Đã xác nhận bạn nhận được đồ.",
                  "confirmed",
                )
              }
            >
              <Icon name="box" /> Tôi đã nhận được đồ
            </Button>
          )}
          <Button
            variant="secondary"
            className="quiet"
            disabled={busy}
            onClick={() => setDisputing((value) => !value)}
          >
            <Icon name="flag" /> Báo sự cố
          </Button>
        </div>
      )}
      <ul className="handover-checks">
        <li className={handover.ownerConfirmedAt || done ? "done" : ""}>
          <Icon name="check" width="14" height="14" /> Người nhặt xác nhận đã
          giao
        </li>
        <li className={handover.claimantConfirmedAt ? "done" : ""}>
          <Icon name="check" width="14" height="14" /> Người nhận xác nhận đã
          nhận
        </li>
      </ul>
      {role === "OWNER" && otherConfirmed && !done && (
        <p className="muted">
          Người nhận đã xác nhận nhận được đồ. Bạn có thể hoàn tất bàn giao.
        </p>
      )}
      {role === "CLAIMANT" && confirmed && !done && (
        <p className="muted">Đã ghi nhận. Chờ người nhặt hoàn tất bàn giao.</p>
      )}
      {editing && (
        <form className="handover-form" onSubmit={propose}>
          <Input
            label="Thời gian"
            type="datetime-local"
            value={at}
            min={localInput(new Date().toISOString())}
            onChange={(e) => setAt(e.target.value)}
            required
            disabled={busy}
          />
          <Input
            label="Địa điểm"
            value={place}
            maxLength={200}
            placeholder="Ví dụ: Sảnh tòa A, cạnh quầy bảo vệ"
            onChange={(e) => setPlace(e.target.value)}
            required
            disabled={busy}
          />
          <Button disabled={busy}>{busy ? "Đang gửi…" : "Gửi lịch hẹn"}</Button>
        </form>
      )}
      {disputing && (
        <form className="handover-form" onSubmit={dispute}>
          <Textarea
            label="Mô tả sự cố"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            disabled={busy}
          />
          <Button disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi khiếu nại"}
          </Button>
        </form>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
