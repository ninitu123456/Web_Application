import { validDate } from "./validation";
import type { ItemType } from "./types";

export interface ItemFields {
  title: string;
  type: ItemType;
  categoryId: string;
  locationId: string;
  eventDate: string;
  description: string;
  color: string;
}
export function itemFieldErrors(
  fields: ItemFields,
): Partial<Record<keyof ItemFields, string>> {
  const errors: Partial<Record<keyof ItemFields, string>> = {};
  if (!fields.title.trim() || Array.from(fields.title.trim()).length > 200)
    errors.title = "Vui lòng nhập tiêu đề, tối đa 200 ký tự.";
  for (const key of ["categoryId", "locationId"] as const)
    if (!Number.isSafeInteger(Number(fields[key])) || Number(fields[key]) <= 0)
      errors[key] =
        key === "categoryId"
          ? "Chọn danh mục hợp lệ."
          : "Chọn địa điểm hợp lệ.";
  if (!validDate(fields.eventDate)) errors.eventDate = "Chọn ngày hợp lệ.";
  if (Array.from(fields.color.trim()).length > 80)
    errors.color = "Màu sắc tối đa 80 ký tự.";
  if (!fields.description.trim())
    errors.description = "Vui lòng nhập mô tả đồ vật.";
  else if (new TextEncoder().encode(fields.description.trim()).length > 65535)
    errors.description = "Mô tả quá dài. Vui lòng rút ngắn.";
  return errors;
}
