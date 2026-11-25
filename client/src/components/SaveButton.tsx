import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useSaved } from "../lib/saved";
import { errorText } from "../lib/api";
import { Icon } from "./Icon";
import { useToast } from "./ui";

function useSignedInUser() {
  // Cards also render in places without an AuthProvider (previews, tests).
  try {
    return useAuth().user;
  } catch {
    return null;
  }
}
export function SaveButton(props: {
  itemId: number;
  ownerId: number;
  variant?: "card" | "detail";
}) {
  const user = useSignedInUser();
  if (!user || user.id === props.ownerId) return null;
  return <SaveToggle {...props} />;
}
function SaveToggle({
  itemId,
  variant = "card",
}: {
  itemId: number;
  ownerId: number;
  variant?: "card" | "detail";
}) {
  const saved = useSaved();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = saved.isSaved(itemId);
  const label = on ? "Bỏ lưu tin" : "Lưu tin";
  return (
    <button
      type="button"
      className={`save-btn save-${variant}${on ? " is-on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const next = await saved.toggleSaved(itemId);
          if (variant === "detail")
            toast(next ? "Đã lưu tin vào mục Đã lưu" : "Đã bỏ lưu tin");
        } catch (error) {
          toast(errorText(error), true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="heart" width="18" height="18" />
      {variant === "detail" && <span>{on ? "Đã lưu" : "Lưu tin"}</span>}
    </button>
  );
}
