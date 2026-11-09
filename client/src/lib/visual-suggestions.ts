import type { ItemStatus } from "./types";

export function canShowVisualSuggestions({
  enabled,
  owner,
  type,
  status,
}: {
  enabled: boolean;
  owner: boolean;
  type: string;
  status: ItemStatus;
}) {
  return (
    enabled &&
    owner &&
    type === "LOST" &&
    ["OPEN", "CLAIM_PENDING", "CLAIMED"].includes(status)
  );
}
