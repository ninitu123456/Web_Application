import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorText, invalidate } from "./api";
export type NotificationTarget =
  | { kind: "SUGGESTIONS"; itemId: number }
  | {
      kind: "RECEIVED_CLAIM" | "CLAIM_CONTACT";
      itemId: number;
      claimId: number;
    }
  | { kind: "CLAIM_HISTORY"; claimId: number; page: number };
export const navigableNotifications = new Set([
  "NEW_MATCH",
  "AI_VISUAL_SIMILAR_ITEM",
  "NEW_CLAIM",
  "CLAIM_APPROVED",
  "CLAIM_REJECTED",
  "CLAIM_COMPLETED",
]);
const valid = (id: number) => Number.isSafeInteger(id) && id > 0;
export function notificationRoute(target: NotificationTarget, id: number) {
  if (!valid(id)) throw Error("Invalid notification");
  if (target.kind === "CLAIM_HISTORY") {
    if (!valid(target.claimId) || !valid(target.page))
      throw Error("Invalid history");
    return `/yeu-cau-cua-toi?page=${target.page}&notification=${id}#claim-${target.claimId}`;
  }
  if (!valid(target.itemId)) throw Error("Invalid Item");
  if (target.kind === "SUGGESTIONS")
    return `/do-vat/${target.itemId}?tab=matches&notification=${id}#suggestions-title`;
  if (!valid(target.claimId)) throw Error("Invalid Claim");
  return `/do-vat/${target.itemId}?tab=${target.kind === "RECEIVED_CLAIM" ? "claims" : "matches"}&notification=${id}#${target.kind === "RECEIVED_CLAIM" ? "received-claims" : "contact-action"}`;
}
export function useNotificationArrival({
  itemId,
  claimIds,
  suggestionsReady = false,
  claimsReady = false,
}: {
  itemId?: number;
  claimIds?: number[];
  suggestionsReady?: boolean;
  claimsReady?: boolean;
}) {
  const [params] = useSearchParams();
  const id = params.get("notification");
  const [state, setState] = useState<{
    target?: NotificationTarget;
    error?: string;
  }>({});
  const claims = JSON.stringify(claimIds ?? []);
  const historyReady = claimIds !== undefined;
  useEffect(() => {
    if (!id || !/^[1-9][0-9]*$/.test(id) || !valid(Number(id))) return;
    if (itemId === undefined && !historyReady) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { data: target } = await api<NotificationTarget>(
          `/notifications/${id}/target`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const matches =
          target.kind === "CLAIM_HISTORY"
            ? JSON.parse(claims).includes(target.claimId)
            : target.itemId === itemId;
        if (!matches) throw Error("Unavailable destination");
        setState({ target });
        if (
          (target.kind === "SUGGESTIONS" && !suggestionsReady) ||
          (target.kind === "RECEIVED_CLAIM" && !claimsReady)
        )
          return;
        const anchor =
          target.kind === "SUGGESTIONS"
            ? "suggestions-title"
            : target.kind === "RECEIVED_CLAIM"
              ? "received-claims"
              : target.kind === "CLAIM_CONTACT"
                ? "contact-action"
                : `claim-${target.claimId}`;
        const element = document.getElementById(anchor);
        if (!element) return;
        element.scrollIntoView({ block: "center" });
        element.focus({ preventScroll: true });
        await api(`/notifications/${id}/read`, {
          method: "PATCH",
          signal: controller.signal,
        });
        if (!controller.signal.aborted) invalidate();
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            error:
              error instanceof Error &&
              error.message === "Unavailable destination"
                ? "Nội dung thông báo không còn phù hợp. Thông báo vẫn chưa được đánh dấu đã đọc."
                : errorText(error),
          });
      }
    })();
    return () => controller.abort();
  }, [id, itemId, claims, historyReady, suggestionsReady, claimsReady]);
  return state;
}
