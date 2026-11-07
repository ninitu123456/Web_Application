export const statusGroups = {
  itemType: { LOST: "Đồ bị mất", FOUND: "Đồ nhặt được" },
  item: {
    OPEN: "Đang mở",
    CLAIM_PENDING: "Chờ xác minh",
    CLAIMED: "Chờ bàn giao",
    RETURNED: "Đã trao lại",
    CLOSED: "Đã đóng",
  },
  claim: {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã chấp thuận",
    REJECTED: "Đã từ chối",
    COMPLETED: "Đã bàn giao",
  },
  report: {
    PENDING: "Chờ xem xét",
    REVIEWING: "Đang xem xét",
    RESOLVED: "Đã giải quyết",
    DISMISSED: "Đã bác bỏ",
  },
  account: { ACTIVE: "Đang hoạt động", SUSPENDED: "Đã đình chỉ" },
  role: { USER: "Người dùng", ADMIN: "Quản trị viên" },
} as const;
export type StatusGroup = keyof typeof statusGroups;

export function statusLabel(status: string, group: StatusGroup): string {
  const labels: Readonly<Record<string, string>> = statusGroups[group];
  return Object.hasOwn(labels, status) ? labels[status] : "Chưa xác định";
}

export function activityDetailLabel(
  key: string,
  value: unknown,
  entity: string,
): string {
  if (key === "reason")
    return typeof value === "string" ? value : "Không có lý do";
  if (key === "visibility" || key === "previousVisibility")
    return value === "HIDDEN"
      ? "Đã gỡ khỏi công khai"
      : value === "PUBLIC"
        ? "Đang công khai"
        : "Chưa xác định";
  if (key === "status" || key === "previousStatus") {
    const group = {
      ITEM: "item",
      CLAIM: "claim",
      REPORT: "report",
      USER: "account",
    }[entity] as StatusGroup | undefined;
    return group && typeof value === "string"
      ? statusLabel(value, group)
      : "Chưa xác định";
  }
  if (key === "decision")
    return value === "APPROVE"
      ? "Chấp thuận"
      : value === "REJECT"
        ? "Từ chối"
        : "Chưa xác định";
  if (key === "source") {
    if (value === "ADMIN_VISIBILITY") return "Quản trị viên thay đổi hiển thị";
    return value === "ADMIN_MODERATION"
      ? "Quản trị viên đóng bài"
      : value === "ADMIN_RESOLVE"
        ? "Quản trị viên giải quyết tranh chấp"
        : "Chưa xác định";
  }
  if (typeof value === "boolean") return value ? "Có" : "Không";
  // Only counts and references are rendered as numbers; no arbitrary structures or debug text.
  if (
    [
      "itemId",
      "decisionLogId",
      "rejectedClaimCount",
      "autoRejectedClaimCount",
    ].includes(key)
  ) {
    const text = String(value);
    return /^\d+$/.test(text)
      ? ["itemId", "decisionLogId"].includes(key)
        ? `#${text}`
        : text
      : "Chưa xác định";
  }
  return "Chưa xác định";
}
