import { describe, expect, it } from "vitest";
import { foundMessage } from "./FoundItModal";
import type { Item } from "../lib/types";

describe("foundMessage", () => {
  it("formats place, date and optional note without leaking extra fields", () => {
    const item = { id: 4, title: "Ví da nâu" } as Item;
    const text = foundMessage(item, "Thư viện", "2026-11-20", "");
    expect(text).toContain("“Ví da nâu” (tin #4)");
    expect(text).toContain("Ngày nhặt: 20/11/2026");
    expect(text).not.toContain("Ghi chú");
    expect(foundMessage(item, "A", "2026-11-20", "Để ở bảo vệ")).toContain("Ghi chú: Để ở bảo vệ");
  });
});
