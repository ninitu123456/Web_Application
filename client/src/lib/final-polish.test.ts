import { beforeEach, describe, expect, it } from "vitest";
import { updateUpload, uploadLabels, type UploadEntry } from "./image-uploads";
import { campusToday, itemFieldErrors, touchItemField } from "./item-form";
import { hasContent, loadDraft, saveDraft } from "./item-draft";

const fields = {
  title: "Ví da nâu",
  type: "LOST" as const,
  categoryId: "1",
  locationId: "2",
  eventDate: "2026-11-01",
  description: "Ví có thẻ sinh viên",
  color: "",
};

describe("upload progress", () => {
  const entry: UploadEntry = {
    key: "a",
    file: new File(["x"], "a.png", { type: "image/png" }),
    previewUrl: "blob:a",
    status: "uploading",
    attempt: 1,
    progress: 0.4,
  };
  it("tracks progress while uploading", () => {
    const [next] = updateUpload([entry], {
      key: "a",
      attempt: 1,
      status: "uploading",
      progress: 0.8,
    });
    expect(next.progress).toBe(0.8);
  });
  it("never moves a finished upload back to uploading", () => {
    const saved = { ...entry, status: "saved" as const, progress: 1 };
    const [next] = updateUpload([saved], {
      key: "a",
      attempt: 1,
      status: "uploading",
      progress: 0.9,
    });
    expect(next.status).toBe("saved");
  });
  it("labels ready and finished photos clearly", () => {
    expect(uploadLabels.pending).toContain("Sẵn sàng");
    expect(uploadLabels.saved).toBe("Đã tải xong");
  });
});

describe("event date and field validation", () => {
  it("uses the campus calendar day", () => {
    expect(campusToday(new Date("2026-11-15T18:00:00Z"))).toBe("2026-11-16");
    expect(campusToday(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-15");
  });
  it("rejects future event dates", () => {
    expect(
      itemFieldErrors({ ...fields, eventDate: "2999-01-01" }).eventDate,
    ).toMatch(/tương lai/);
    expect(itemFieldErrors(fields).eventDate).toBeUndefined();
  });
  it("validates a single field on blur", () => {
    expect(
      touchItemField({ ...fields, title: " " }, {}, "title").title,
    ).toBeTruthy();
    expect(
      touchItemField(fields, { title: "x" }, "title").title,
    ).toBeUndefined();
  });
});

describe("post drafts", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });
  it("saves and restores text per account", () => {
    saveDraft(7, fields, 2);
    expect(loadDraft(7)?.fields.title).toBe("Ví da nâu");
    expect(loadDraft(7)?.step).toBe(2);
    expect(loadDraft(8)).toBeNull();
  });
  it("detects empty drafts", () => {
    expect(
      hasContent({
        ...fields,
        title: "",
        categoryId: "",
        locationId: "",
        eventDate: "",
        description: "",
      }),
    ).toBe(false);
    expect(hasContent(fields)).toBe(true);
  });
  it("discards malformed drafts", () => {
    localStorage.setItem("findit.itemDraft.v1.7", "{bad json");
    expect(loadDraft(7)).toBeNull();
  });
});
