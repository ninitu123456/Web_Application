import type { ClaimStatus, Handover, ItemStatus, ItemType } from "./types";

export interface ConversationThread {
  item: {
    id: number;
    userId: number;
    title: string;
    type: ItemType;
    status: ItemStatus;
    eventDate: string;
    category: string;
    location: string;
    imageUrl: string | null;
  };
  /** OWNER/CLAIMANT for Claims; OWNER/FINDER for an item mentioned in chat. */
  role: "OWNER" | "CLAIMANT" | "FINDER";
  claim: { id: number; status: ClaimStatus } | null;
  handover: Handover | null;
}
export interface ConversationContext {
  peer: { id: string; fullName: string } | null;
  threads: ConversationThread[];
}
export interface ProgressStep {
  label: string;
  hint?: string;
  state: "done" | "current" | "todo";
}

/** The trade timeline shown beside a conversation. */
export function progressSteps(thread: ConversationThread): ProgressStep[] {
  const steps: [string, boolean, string?][] = [];
  if (thread.claim) {
    const status = thread.claim.status;
    const handover = thread.handover;
    const approved = status === "APPROVED" || status === "COMPLETED";
    steps.push(
      ["Gửi yêu cầu nhận lại", true],
      [
        "Người nhặt xác minh và chấp thuận",
        approved,
        "Dựa trên câu trả lời và bằng chứng",
      ],
      [
        "Thống nhất lịch hẹn",
        handover?.appointment?.status === "ACCEPTED" || status === "COMPLETED",
        "Đề xuất ngay trong khung chat",
      ],
      ["Hai bên xác nhận trao đồ", status === "COMPLETED"],
    );
  } else {
    const closed =
      thread.item.status === "RETURNED" || thread.item.status === "CLOSED";
    steps.push(
      ["Báo nhặt được", true],
      ["Xác minh qua tin nhắn", closed, "Chủ đồ mô tả đặc điểm riêng"],
      ["Hẹn gặp trao đồ", closed],
      ["Chủ đồ đóng tin", closed, "Sau khi nhận lại đồ"],
    );
  }
  const firstOpen = steps.findIndex(([, done]) => !done);
  return steps.map(([label, done, hint], index) => ({
    label,
    hint: index === firstOpen ? hint : undefined,
    state: done ? "done" : index === firstOpen ? "current" : "todo",
  }));
}

const time = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
/** Chat line posted after a handover action so both sides keep a record. */
export function handoverMessage(
  change: string,
  handover: Handover,
  title: string,
) {
  const slot = handover.appointment
    ? `${time(handover.appointment.at)} tại ${handover.appointment.place}`
    : "";
  switch (change) {
    case "proposed":
      return `📅 Mình đề xuất hẹn trao “${title}”: ${slot}. Bạn bấm “Đồng ý” trên thẻ lịch hẹn nếu tiện nhé.`;
    case "accepted":
      return `✅ Đã chốt lịch hẹn: ${slot}. Hẹn gặp bạn!`;
    case "confirmed":
      return `📦 Mình đã nhận được “${title}”. Cảm ơn bạn rất nhiều!`;
    default:
      return "";
  }
}
