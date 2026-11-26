import { createHash } from 'node:crypto';
import { HttpError } from '../utils/http-error.js';
import { itemDto } from '../utils/item-dto.js';
import { paged, apiId } from '../utils/workflow-dto.js';

const missing = () => new HttpError(404, 'Không tìm thấy Item');
const iso = (value) => value instanceof Date ? value.toISOString() : value ?? null;
const count = (value) => {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Count cannot be represented safely in the API');
  return number;
};
export const contactDto = (row) => ({
  id: apiId(row.contact_id), userId: row.user_id == null ? null : apiId(row.user_id), fullName: row.full_name, email: row.email,
  topic: row.topic, body: row.body, itemUrl: row.item_url ?? null, status: row.status,
  createdAt: iso(row.created_at), handledAt: iso(row.handled_at), handledBy: row.handled_by == null ? null : apiId(row.handled_by)
});
export const disputeDto = (row) => ({
  claimId: apiId(row.claim_id), claimStatus: row.claim_status, reason: row.dispute_reason, disputedAt: iso(row.disputed_at), resolvedAt: iso(row.dispute_resolved_at),
  disputedBy: row.disputed_by == null ? null : { id: apiId(row.disputed_by), fullName: row.disputer_name ?? null },
  item: { id: apiId(row.item_id), title: row.item_title },
  owner: { id: apiId(row.owner_id), fullName: row.owner_name }, claimant: { id: apiId(row.claimant_id), fullName: row.claimant_name },
  appointment: row.appointment_status && row.appointment_status !== 'NONE' ? { at: iso(row.appointment_at), place: row.appointment_place, status: row.appointment_status } : null
});
export function viewerKey(identity, client = {}) {
  const raw = identity ? `user:${identity.id}` : `anon:${client.ip ?? ''}|${client.userAgent ?? ''}`;
  return createHash('sha256').update(raw).digest('hex');
}
export function createEngagementService(repository) {
  async function visibleItem(itemId, identity) {
    const item = await repository.findItem(itemId);
    if (!item || (Number(item.is_hidden) && identity?.role !== 'ADMIN' && String(identity?.id) !== String(item.user_id))) throw missing();
    return item;
  }
  return {
    async save(identity, itemId) {
      const item = await visibleItem(itemId, identity);
      if (String(item.user_id) === String(identity.id)) throw new HttpError(400, 'Không cần lưu bài đăng của chính bạn');
      await repository.save(identity.id, itemId);
      return { itemId, saved: true };
    },
    async unsave(identity, itemId) {
      await repository.unsave(identity.id, itemId);
      return { itemId, saved: false };
    },
    async savedIds(identity) { return (await repository.savedIds(identity.id)).map(apiId); },
    async listSaved(identity, options) {
      const { rows, total } = await repository.listSaved(identity.id, options);
      return paged(rows, total, options, (row) => ({ ...itemDto(row), savedAt: iso(row.saved_at) }));
    },
    async recordView(identity, itemId, client) {
      const item = await visibleItem(itemId, identity);
      if (identity && String(item.user_id) === String(identity.id)) return { counted: false };
      if (Number(item.is_hidden)) return { counted: false };
      return { counted: await repository.recordView(itemId, viewerKey(identity, client)) };
    },
    async itemStats(identity, itemId) {
      const item = await visibleItem(itemId, identity);
      if (String(item.user_id) !== String(identity.id) && identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
      const row = await repository.itemStats(itemId);
      return { views: count(row.views), saves: count(row.saves), claims: count(row.claims), pendingClaims: count(row.pending_claims) };
    },
    async userStats(identity) {
      const { posts, claims, incoming, views, saved } = await repository.userStats(identity.id);
      return {
        posts: { total: count(posts.total), lost: count(posts.lost), found: count(posts.found), active: count(posts.active), returned: count(posts.returned),
          byStatus: { OPEN: count(posts.s_open), CLAIM_PENDING: count(posts.s_claim_pending), CLAIMED: count(posts.s_claimed), RETURNED: count(posts.returned), CLOSED: count(posts.s_closed) } },
        claims: { sent: count(claims.sent), pending: count(claims.pending), approved: count(claims.approved), completed: count(claims.completed) },
        incomingPendingClaims: count(incoming.pending), totalViews: count(views.total), savedItems: count(saved.total)
      };
    },
    async contact(identity, input) { return contactDto(await repository.createContact(identity?.id, input)); },
    async listContacts(identity, options) {
      if (identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
      const { rows, total } = await repository.listContacts(options);
      return paged(rows, total, options, contactDto);
    },
    async handleContact(identity, contactId) {
      if (identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
      const row = await repository.handleContact(contactId, identity.id);
      if (!row) throw new HttpError(404, 'Không tìm thấy liên hệ');
      return contactDto(row);
    },
    async listDisputes(identity, options) {
      if (identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
      const { rows, total } = await repository.listDisputes(options);
      return paged(rows, total, options, disputeDto);
    },
    async resolveDispute(identity, claimId) {
      if (identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
      if (!await repository.resolveDispute(claimId, identity.id)) throw new HttpError(404, 'Không tìm thấy khiếu nại');
      return { claimId, resolved: true };
    }
  };
}
