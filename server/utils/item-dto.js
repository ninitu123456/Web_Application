function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Item ID cannot be represented safely in the API');
  return number;
}
function dateValue(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
export function itemDto(item) {
  const result = {
    id: id(item.item_id), userId: id(item.user_id), categoryId: id(item.category_id), locationId: id(item.location_id),
    title: item.title, description: item.description, type: item.type, color: item.color,
    eventDate: dateValue(item.event_date), status: item.status,
    createdAt: item.created_at instanceof Date ? item.created_at.toISOString() : item.created_at,
    updatedAt: item.updated_at instanceof Date ? item.updated_at.toISOString() : item.updated_at
  };
  if (item.category_name !== undefined) result.category = { id: id(item.category_id), name: item.category_name };
  if (item.location_name !== undefined) result.location = { id: id(item.location_id), name: item.location_name };
  if (item.images !== undefined) result.images = item.images.map((image) => ({ id: id(image.image_id), url: image.image_url }));
  return result;
}
