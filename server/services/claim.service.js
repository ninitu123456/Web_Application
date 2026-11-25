import { HttpError } from '../utils/http-error.js';
import { claimDto } from '../utils/claim-dto.js';
import { paged } from '../utils/workflow-dto.js';

const missing = () => new HttpError(404, 'Không tìm thấy Claim hoặc Item');
const conflict = (message = 'Trạng thái hiện tại không cho phép thao tác Claim') => new HttpError(409, message);

const iso = (value) => value instanceof Date ? value.toISOString() : value ?? null;
export function handoverDto(claim, item, row = {}) {
  return {
    claimId: Number(claim.claim_id), claimStatus: claim.status,
    appointment: row.appointment_status && row.appointment_status !== 'NONE'
      ? { at: iso(row.appointment_at), place: row.appointment_place, status: row.appointment_status, proposedBy: row.proposed_by == null ? null : Number(row.proposed_by) }
      : null,
    ownerConfirmedAt: iso(row.owner_confirmed_at), claimantConfirmedAt: iso(row.claimant_confirmed_at),
    dispute: row.disputed_at ? { reason: row.dispute_reason, by: row.disputed_by == null ? null : Number(row.disputed_by), at: iso(row.disputed_at), resolvedAt: iso(row.dispute_resolved_at) } : null,
    ownerId: Number(item.user_id), claimantId: Number(claim.claimant_id)
  };
}
// MySQL DATETIME has no zone; the pool runs in UTC.
const mysqlDate = (value) => new Date(value).toISOString().slice(0, 19).replace('T', ' ');
export function createClaimService(repository) {
  async function itemForClaim(claimId) {
    const itemId = await repository.findClaimItemId(claimId);
    if (!itemId) throw missing();
    return itemId;
  }
  function ownerOnly(identity, item) {
    if (String(item.user_id) !== String(identity.id)) throw new HttpError(403, 'Không có quyền truy cập');
  }
  async function handoverContext(identity, claimId, operation, { allowAdmin = false } = {}) {
    const itemId = await itemForClaim(claimId);
    return repository.withLockedItem(itemId, async (source) => {
      if (!source) throw missing();
      const item = await source.findItem();
      const claim = await source.findClaimForUpdate(claimId);
      if (!claim) throw missing();
      const role = String(item.user_id) === String(identity.id) ? 'OWNER' : String(claim.claimant_id) === String(identity.id) ? 'CLAIMANT' : null;
      if (!role && !(allowAdmin && identity.role === 'ADMIN')) throw new HttpError(403, 'Không có quyền truy cập');
      if (!['APPROVED', 'COMPLETED'].includes(claim.status)) throw conflict('Chỉ yêu cầu đã duyệt mới có lịch hẹn bàn giao');
      return operation({ source, item, claim, role, handover: await source.findHandover(claimId) ?? {} });
    });
  }
  const pendingHandover = ({ claim, item, handover }) => {
    if (claim.status !== 'APPROVED' || item.status !== 'CLAIMED') throw conflict('Yêu cầu đã hoàn tất bàn giao');
    if (handover.disputed_at && !handover.dispute_resolved_at) throw conflict('Bàn giao đang được ban quản trị xem xét khiếu nại');
  };
  return {
    async handover(identity, claimId) {
      return handoverContext(identity, claimId, ({ claim, item, handover }) => handoverDto(claim, item, handover), { allowAdmin: true });
    },
    async proposeAppointment(identity, claimId, { appointmentAt, place }) {
      return handoverContext(identity, claimId, async (context) => {
        pendingHandover(context);
        const { source, claim, item, handover } = context;
        if (handover.owner_confirmed_at || handover.claimant_confirmed_at) throw conflict('Đã có bên xác nhận bàn giao, không thể đổi lịch hẹn');
        const row = await source.saveHandover(claimId, { appointment_at: mysqlDate(appointmentAt), appointment_place: place, proposed_by: identity.id, appointment_status: 'PROPOSED' });
        await source.audit(identity.id, 'HANDOVER_PROPOSED', claimId, { itemId: String(item.item_id) });
        return handoverDto(claim, item, row);
      });
    },
    async acceptAppointment(identity, claimId) {
      return handoverContext(identity, claimId, async (context) => {
        pendingHandover(context);
        const { source, claim, item, handover } = context;
        if (handover.appointment_status !== 'PROPOSED') throw conflict('Không có lịch hẹn chờ xác nhận');
        if (String(handover.proposed_by) === String(identity.id)) throw conflict('Bên còn lại cần xác nhận lịch hẹn');
        const row = await source.saveHandover(claimId, { appointment_status: 'ACCEPTED' });
        await source.audit(identity.id, 'HANDOVER_ACCEPTED', claimId, { itemId: String(item.item_id) });
        return handoverDto(claim, item, row);
      });
    },
    // Both sides confirm; the second confirmation completes the Claim.
    async confirmHandover(identity, claimId) {
      return handoverContext(identity, claimId, async (context) => {
        pendingHandover(context);
        const { source, claim, item, role, handover } = context;
        const field = role === 'OWNER' ? 'owner_confirmed_at' : 'claimant_confirmed_at';
        const other = role === 'OWNER' ? 'claimant_confirmed_at' : 'owner_confirmed_at';
        let row = handover;
        if (!handover[field]) {
          row = await source.saveHandover(claimId, { [field]: 'NOW' });
          await source.audit(identity.id, 'HANDOVER_CONFIRMED', claimId, { itemId: String(item.item_id), side: role });
        }
        if (!row[other]) return handoverDto(claim, item, row);
        if (!await source.updateClaim(claimId, 'APPROVED', 'COMPLETED', 'completed_at')) throw conflict();
        if (!await source.returnItem()) throw conflict();
        await source.audit(identity.id, 'CLAIM_COMPLETED', claimId, { itemId: String(item.item_id), confirmedByBoth: true });
        await source.notifyClaim('CLAIM_COMPLETED', claimId);
        return handoverDto(await source.findClaimForUpdate(claimId), item, row);
      });
    },
    async disputeHandover(identity, claimId, { reason }) {
      return handoverContext(identity, claimId, async (context) => {
        const { source, claim, item, handover } = context;
        if (claim.status !== 'APPROVED' || item.status !== 'CLAIMED') throw conflict('Yêu cầu đã hoàn tất bàn giao');
        if (handover.disputed_at && !handover.dispute_resolved_at) throw conflict('Khiếu nại đang được xem xét');
        const row = await source.saveHandover(claimId, { dispute_reason: reason, disputed_by: identity.id, disputed_at: 'NOW', dispute_resolved_at: null });
        await source.audit(identity.id, 'HANDOVER_DISPUTED', claimId, { itemId: String(item.item_id) });
        return handoverDto(claim, item, row);
      });
    },
    async create(identity, itemId, { proofDescription, answers = [] }) {
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        if (Number(item.is_hidden)) throw missing();
        if (item.type !== 'FOUND') throw new HttpError(400, 'Chỉ FOUND Item mới nhận Claim');
        if (String(item.user_id) === String(identity.id)) throw new HttpError(403, 'Không thể Claim Item của chính mình');
        if (!['OPEN', 'CLAIM_PENDING'].includes(item.status)) throw conflict('Item không nhận Claim ở trạng thái hiện tại');
        if (await source.activeClaimExists()) throw conflict('Item đã có Claim được duyệt');
        if (await source.findClaimByClaimant(identity.id)) throw conflict('Bạn đã tạo Claim cho Item này');
        const questions = source.questions ? await source.questions() : [];
        const expected = questions.map((row) => String(row.question_id)).sort();
        const given = answers.map((entry) => String(entry.questionId)).sort();
        if (JSON.stringify(expected) !== JSON.stringify(given)) throw new HttpError(400, 'Vui lòng trả lời đầy đủ các câu hỏi xác minh');
        try {
          const claim = await source.createClaim(identity.id, proofDescription);
          if (answers.length) await source.saveAnswers(claim.claim_id, answers);
          await source.notifyClaim('NEW_CLAIM', claim.claim_id);
          return claimDto(claim);
        }
        catch (error) {
          if (error.code === 'ER_DUP_ENTRY' && /uq_claims_claimant_item/.test(error.sqlMessage ?? '')) throw conflict('Bạn đã tạo Claim cho Item này');
          throw error;
        }
      });
    },
    async mine(identity, options = { page: 1, limit: 10 }) {
      const { rows, total } = await repository.listMine(identity.id, options);
      return paged(rows, total, options, claimDto);
    },
    async forItem(identity, itemId, options = { page: 1, limit: 10 }) {
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        if (item.type !== 'FOUND') throw new HttpError(400, 'Chỉ FOUND Item có Claims');
        if (String(item.user_id) !== String(identity.id) && identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
        const { rows, total } = await source.listForItem(options);
        return paged(rows, total, options, claimDto);
      }, { snapshot: true });
    },
    async approve(identity, claimId) {
      const itemId = await itemForClaim(claimId);
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        const claim = await source.findClaimForUpdate(claimId);
        if (!claim) throw missing();
        if (item.type !== 'FOUND') throw conflict('Claim liên kết với Item không hợp lệ');
        ownerOnly(identity, item);
        if (claim.status !== 'PENDING' || item.status !== 'CLAIM_PENDING') throw conflict();
        if (await source.activeClaimExists(claimId)) throw conflict('Item đã có Claim được duyệt');
        if (!await source.updateClaim(claimId, 'PENDING', 'APPROVED', 'reviewed_at')) throw conflict();
        if (!await source.claimItem()) throw conflict();
        await source.audit(identity.id, 'CLAIM_APPROVED', claimId, { itemId: String(itemId) });
        await source.notifyClaim('CLAIM_APPROVED', claimId);
        const rejected = await source.rejectOtherPending(claimId);
        for (const rejectedId of rejected) {
          await source.audit(identity.id, 'CLAIM_REJECTED', rejectedId, { itemId: String(itemId), automatic: true });
          await source.notifyClaim('CLAIM_REJECTED', rejectedId);
        }
        return claimDto(await source.findClaimForUpdate(claimId));
      });
    },
    async reject(identity, claimId) {
      const itemId = await itemForClaim(claimId);
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        const claim = await source.findClaimForUpdate(claimId);
        if (!claim) throw missing();
        if (item.type !== 'FOUND') throw conflict('Claim liên kết với Item không hợp lệ');
        ownerOnly(identity, item);
        if (claim.status !== 'PENDING' || item.status !== 'CLAIM_PENDING') throw conflict();
        if (!await source.updateClaim(claimId, 'PENDING', 'REJECTED', 'reviewed_at')) throw conflict();
        await source.audit(identity.id, 'CLAIM_REJECTED', claimId, { itemId: String(itemId) });
        await source.resetItemOpen();
        await source.notifyClaim('CLAIM_REJECTED', claimId);
        return claimDto(await source.findClaimForUpdate(claimId));
      });
    },
    async complete(identity, claimId) {
      const itemId = await itemForClaim(claimId);
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        const claim = await source.findClaimForUpdate(claimId);
        if (!claim) throw missing();
        if (item.type !== 'FOUND') throw conflict('Claim liên kết với Item không hợp lệ');
        ownerOnly(identity, item);
        if (claim.status !== 'APPROVED' || item.status !== 'CLAIMED') throw conflict();
        const handover = source.findHandover ? await source.findHandover(claimId) : undefined;
        if (handover?.disputed_at && !handover.dispute_resolved_at) throw conflict('Bàn giao đang được ban quản trị xem xét khiếu nại');
        if (!await source.updateClaim(claimId, 'APPROVED', 'COMPLETED', 'completed_at')) throw conflict();
        if (!await source.returnItem()) throw conflict();
        await source.audit(identity.id, 'CLAIM_COMPLETED', claimId, { itemId: String(itemId) });
        await source.notifyClaim('CLAIM_COMPLETED', claimId);
        return claimDto(await source.findClaimForUpdate(claimId));
      });
    }
  };
}
