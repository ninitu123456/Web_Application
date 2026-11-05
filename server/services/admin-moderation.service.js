import { HttpError } from '../utils/http-error.js';
import { deleteAiVisualCandidatesIfPresent } from '../ai-visual/invalidation.js';
import { adminClaimDto, adminClaimSummary, activityLogDto } from '../utils/admin-dto.js';
import { paged } from '../utils/workflow-dto.js';
import { itemDto } from '../utils/item-dto.js';

const conflict = () => new HttpError(409, 'Trạng thái Item/Claim không cho phép thao tác');
const missing = () => new HttpError(404, 'Không tìm thấy Item hoặc Claim');
export function createAdminModerationService(repository) {
  function authorized(identity, matching, operation) {
    if (identity?.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền quản trị');
    return repository.withActor(identity, matching, operation);
  }
  async function context(source, identity, id) {
    const item = await source.lockItem(id); if (!item) throw missing();
    const claims = await source.lockClaims(id);
    if (String(item.user_id) === String(identity.id) || claims.some((claim) => String(claim.claimant_id) === String(identity.id))) throw new HttpError(403, 'ADMIN liên quan phải nhờ quản trị viên khác xử lý');
    const pending = claims.filter((claim) => claim.status === 'PENDING');
    if (claims.some((claim) => ['APPROVED', 'COMPLETED'].includes(claim.status)) ||
      (claims.length && item.type !== 'FOUND') || !['OPEN', 'CLAIM_PENDING'].includes(item.status) ||
      (item.status === 'OPEN' && pending.length) || (item.status === 'CLAIM_PENDING' && !pending.length)) throw conflict();
    return { item, claims, pending };
  }
  async function transition(source, claim, status) {
    const [result] = await source.run("UPDATE claims SET status=?,reviewed_at=UTC_TIMESTAMP() WHERE claim_id=? AND status='PENDING'", [status, claim.claim_id]);
    if (result.affectedRows !== 1) throw conflict();
  }
  async function itemStatus(source, item, status) {
    const [result] = await source.run('UPDATE items SET status=?,updated_at=UTC_TIMESTAMP() WHERE item_id=? AND status=?', [status, item.item_id, item.status]);
    if (result.affectedRows !== 1) throw conflict();
  }
  return {
    listClaims(identity, options) { return authorized(identity, false, async (source) => { const { rows, total } = await repository.listClaims(source, options); return paged(rows, total, options, adminClaimDto); }); },
    activityLogs(identity, options) { return authorized(identity, false, async (source) => { const { rows, total } = await repository.activityLogs(source, options); return paged(rows, total, options, activityLogDto); }); },
    moderateClose(identity, id, { reason }) {
      return authorized(identity, true, async (source) => {
        const { item, pending } = await context(source, identity, id);
        for (const claim of pending) await transition(source, claim, 'REJECTED');
        await itemStatus(source, item, 'CLOSED');
        await deleteAiVisualCandidatesIfPresent(source.run, id);
        const decisionLogId = await source.audit('ITEM_MODERATED_CLOSED', 'ITEM', id, { previousStatus: item.status, status: 'CLOSED', reason, source: 'ADMIN_MODERATION', rejectedClaimCount: pending.length });
        for (const claim of pending) await source.audit('CLAIM_REJECTED', 'CLAIM', claim.claim_id, { previousStatus: 'PENDING', status: 'REJECTED', itemId: String(id), automatic: true, source: 'ADMIN_MODERATION', decisionLogId });
        await source.notify([{ userId: item.user_id, type: 'ITEM_MODERATED_CLOSED', id }, ...pending.map((claim) => ({ userId: claim.claimant_id, type: 'CLAIM_REJECTED', id: claim.claim_id }))]);
        return { item: itemDto(await source.items.findById(id)), rejectedClaimCount: pending.length };
      });
    },
    resolveClaim(identity, id, { decision, reason }) {
      return authorized(identity, false, async (source) => {
        const itemId = await repository.findClaimItemId(source, id); if (!itemId) throw missing();
        const { item, claims, pending } = await context(source, identity, itemId);
        const claim = claims.find((row) => String(row.claim_id) === String(id)); if (!claim) throw missing();
        if (claim.status !== 'PENDING' || item.type !== 'FOUND' || item.status !== 'CLAIM_PENDING' || !['APPROVE', 'REJECT'].includes(decision)) throw conflict();
        const approved = decision === 'APPROVE', status = approved ? 'APPROVED' : 'REJECTED';
        const rejected = approved ? pending.filter((row) => String(row.claim_id) !== String(id)) : [];
        await transition(source, claim, status);
        for (const other of rejected) await transition(source, other, 'REJECTED');
        const nextStatus = approved ? 'CLAIMED' : pending.length === 1 ? 'OPEN' : 'CLAIM_PENDING';
        await itemStatus(source, item, nextStatus);
        const decisionLogId = await source.audit('CLAIM_ADMIN_RESOLVED', 'CLAIM', id, { previousStatus: claim.status, status, itemId: String(itemId), decision, reason, source: 'ADMIN_RESOLVE', autoRejectedClaimCount: rejected.length });
        await source.audit(approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', 'CLAIM', id, { previousStatus: claim.status, status, itemId: String(itemId), source: 'ADMIN_RESOLVE', decisionLogId });
        for (const other of rejected) await source.audit('CLAIM_REJECTED', 'CLAIM', other.claim_id, { previousStatus: 'PENDING', status: 'REJECTED', itemId: String(itemId), automatic: true, source: 'ADMIN_RESOLVE', decisionLogId });
        await source.notify([{ userId: item.user_id, type: 'CLAIM_ADMIN_RESOLVED', id }, { userId: claim.claimant_id, type: approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', id }, ...rejected.map((row) => ({ userId: row.claimant_id, type: 'CLAIM_REJECTED', id: row.claim_id }))]);
        const [[updated]] = await source.run('SELECT claim_id,item_id,claimant_id,status,submitted_at,reviewed_at,completed_at FROM claims WHERE claim_id=?', [id]);
        return { claim: adminClaimSummary(updated), item: { id: Number(itemId), status: nextStatus }, autoRejectedClaimCount: rejected.length };
      });
    }
  };
}
