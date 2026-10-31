export function apiId(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Workflow ID cannot be represented safely in the API');
  return number;
}
const date = (value) => value instanceof Date ? value.toISOString() : value ?? null;
export const notificationDto = (row) => ({ id: apiId(row.notification_id), type: row.type, message: row.message, isRead: Boolean(Number(row.is_read)), createdAt: date(row.created_at) });
export const reportDto = (row) => ({
  id: apiId(row.report_id), reporterId: apiId(row.reporter_id), targetType: row.target_type,
  targetId: apiId(row.item_id ?? row.reported_user_id ?? row.claim_id), reason: row.reason,
  description: row.description ?? null, status: row.status,
  reviewedBy: row.reviewed_by == null ? null : apiId(row.reviewed_by), reviewedAt: date(row.reviewed_at), createdAt: date(row.created_at)
});
export function paged(rows, total, options, dto) {
  total = Number(total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Workflow count cannot be represented safely in the API');
  return { data: rows.map(dto), pagination: { page: options.page, limit: options.limit, total, totalPages: Math.ceil(total / options.limit) } };
}
