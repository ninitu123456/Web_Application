import { describe, expect, it } from "vitest";
import { itemFieldErrors, changeItemField, type ItemFields } from "./item-form";

const fields: ItemFields = {
  title: "Bình nước xanh",
  type: "FOUND",
  categoryId: "1",
  locationId: "2",
  eventDate: "2026-11-07",
  color: "",
  description: "Nhặt được tại thư viện.",
};
describe("item wizard validation", () => {
  it("allows optional color and both post types", () => {
    expect(itemFieldErrors(fields)).toEqual({});
    expect(itemFieldErrors({ ...fields, type: "LOST" })).toEqual({});
  });
  it("identifies each invalid field for inline errors and focus", () => {
    expect(
      Object.keys(
        itemFieldErrors({
          ...fields,
          title: " ",
          categoryId: "0",
          locationId: "1.5",
          eventDate: "2026-02-29",
          description: " ",
        }),
      ),
    ).toEqual([
      "title",
      "categoryId",
      "locationId",
      "eventDate",
      "description",
    ]);
  });
  it("retains Unicode and UTF-8 limits rather than the reference image limits", () => {
    expect(
      itemFieldErrors({
        ...fields,
        title: "ắ".repeat(200),
        color: "😀".repeat(80),
        description: "ắ".repeat(21845),
      }),
    ).toEqual({});
    const errors = itemFieldErrors({
      ...fields,
      title: "😀".repeat(201),
      color: "ắ".repeat(81),
      description: "😀".repeat(16384),
    });
    expect(Object.keys(errors)).toEqual(["title", "color", "description"]);
  });
});

// A corrected native-select value must clear its old error immediately.
describe("selected location validation", () => {
  it("clears stale errors on a valid ID and preserves other errors", () => {
    const errors = itemFieldErrors({ ...fields, locationId: "", title: "" });
    const next = changeItemField(
      { ...fields, locationId: "", title: "" },
      errors,
      "locationId",
      "2",
    );
    expect(next.fields.locationId).toBe("2");
    expect(next.errors.locationId).toBeUndefined();
    expect(next.errors.title).toBeTruthy();
  });
  it("does not accept display text as an ID and retains selection across lookup/step state", () => {
    const next = changeItemField(
      fields,
      { locationId: "Chọn địa điểm hợp lệ." },
      "locationId",
      "Thư viện",
    );
    expect(next.errors.locationId).toBeTruthy();
    const selected = changeItemField(
      next.fields,
      next.errors,
      "locationId",
      "2",
    );
    expect(itemFieldErrors(selected.fields)).toEqual({});
    expect(selected.fields.locationId).toBe("2");
  });
});
