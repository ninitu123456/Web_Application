function safeId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Admin ID cannot be represented safely in the API'); return id; }
const timestamp = (value) => value instanceof Date ? value.toISOString() : value ?? null;
export function adminUserDto(row) { return { id: safeId(row.user_id), fullName: row.full_name, email: row.email, role: row.role, accountStatus: row.account_status, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) }; }
export function lookupDto(row, idColumn) { return { id: safeId(row[idColumn]), name: row.name, isActive: Boolean(Number(row.is_active)) }; }
export function dashboardNumber(value) { const number = Number(value ?? 0); if (!Number.isSafeInteger(number) || number < 0) throw new Error('Admin aggregate cannot be represented safely in the API'); return number; }

export const businessEntities = ['ITEM', 'CLAIM', 'USER', 'CATEGORY', 'LOCATION', 'REPORT'];
const transition = ['previousStatus', 'status'];
const actionDetails = {
  ITEM_MODERATED_CLOSED: [...transition, 'reason', 'source', 'rejectedClaimCount'],
  CLAIM_ADMIN_RESOLVED: [...transition, 'itemId', 'decision', 'reason', 'source', 'autoRejectedClaimCount'],
  CLAIM_APPROVED: [...transition, 'itemId', 'source', 'decisionLogId'],
  CLAIM_REJECTED: [...transition, 'itemId', 'automatic', 'source', 'decisionLogId'],
  CLAIM_COMPLETED: [...transition, 'itemId'], USER_STATUS_CHANGED: transition, REPORT_STATUS_CHANGED: transition,
  CATEGORY_CREATED: [], CATEGORY_UPDATED: [], CATEGORY_DISABLED: [], LOCATION_CREATED: [], LOCATION_UPDATED: [], LOCATION_DISABLED: []
};
export const businessActions = Object.keys(actionDetails);
export function adminClaimSummary(row) {
  return { id: safeId(row.claim_id), itemId: safeId(row.item_id), claimantId: safeId(row.claimant_id), status: row.status,
    submittedAt: timestamp(row.submitted_at), reviewedAt: timestamp(row.reviewed_at), completedAt: timestamp(row.completed_at) };
}
export function adminClaimDto(row) {
  return { ...adminClaimSummary(row), item: { id: safeId(row.item_id), userId: safeId(row.item_user_id), title: row.item_title, type: row.item_type, status: row.item_status } };
}
export function activityLogDto(row) {
  let raw = row.details;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const details = {};
  for (const key of actionDetails[row.action] ?? []) {
    const value = raw?.[key];
    if (key === 'reason') { if (typeof value === 'string' && [...value].length <= 1000 && Buffer.byteLength(value) <= 4000) details[key] = value; }
    else if (key === 'automatic') { if (typeof value === 'boolean') details[key] = value; }
    else if (['itemId', 'decisionLogId'].includes(key)) { if (/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))) details[key] = safeId(value); }
    else if (key.endsWith('Count')) { if (Number.isSafeInteger(value) && value >= 0) details[key] = value; }
    else if (key === 'source') { if (['ADMIN_MODERATION', 'ADMIN_RESOLVE'].includes(value)) details[key] = value; }
    else if (key === 'decision') { if (['APPROVE', 'REJECT'].includes(value)) details[key] = value; }
    else if (['OPEN', 'CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'ACTIVE', 'SUSPENDED', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(value)) details[key] = value;
  }
  return { id: safeId(row.log_id), actorId: row.user_id == null ? null : safeId(row.user_id), action: row.action, entityType: row.entity_type, entityId: row.entity_id == null ? null : safeId(row.entity_id), createdAt: timestamp(row.created_at), details };
}
