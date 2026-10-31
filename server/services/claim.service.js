import { HttpError } from '../utils/http-error.js';
import { claimDto } from '../utils/claim-dto.js';

const missing = () => new HttpError(404, 'Không tìm thấy Claim hoặc Item');
const conflict = (message = 'Trạng thái hiện tại không cho phép thao tác Claim') => new HttpError(409, message);

export function createClaimService(repository) {
  async function itemForClaim(claimId) {
    const itemId = await repository.findClaimItemId(claimId);
    if (!itemId) throw missing();
    return itemId;
  }
  function ownerOnly(identity, item) {
    if (String(item.user_id) !== String(identity.id)) throw new HttpError(403, 'Không có quyền truy cập');
  }
  return {
    async create(identity, itemId, { proofDescription }) {
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        if (item.type !== 'FOUND') throw new HttpError(400, 'Chỉ FOUND Item mới nhận Claim');
        if (String(item.user_id) === String(identity.id)) throw new HttpError(403, 'Không thể Claim Item của chính mình');
        if (!['OPEN', 'CLAIM_PENDING'].includes(item.status)) throw conflict('Item không nhận Claim ở trạng thái hiện tại');
        if (await source.activeClaimExists()) throw conflict('Item đã có Claim được duyệt');
        if (await source.findClaimByClaimant(identity.id)) throw conflict('Bạn đã tạo Claim cho Item này');
        try { return claimDto(await source.createClaim(identity.id, proofDescription)); }
        catch (error) {
          if (error.code === 'ER_DUP_ENTRY') throw conflict('Bạn đã tạo Claim cho Item này');
          throw error;
        }
      });
    },
    async mine(identity) {
      return (await repository.listMine(identity.id)).map(claimDto);
    },
    async forItem(identity, itemId) {
      return repository.withLockedItem(itemId, async (source) => {
        if (!source) throw missing();
        const item = await source.findItem();
        if (item.type !== 'FOUND') throw new HttpError(400, 'Chỉ FOUND Item có Claims');
        if (String(item.user_id) !== String(identity.id) && identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập');
        return (await source.listForItem()).map(claimDto);
      });
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
        const rejected = await source.rejectOtherPending(claimId);
        for (const rejectedId of rejected) await source.audit(identity.id, 'CLAIM_REJECTED', rejectedId, { itemId: String(itemId), automatic: true });
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
        if (!await source.updateClaim(claimId, 'APPROVED', 'COMPLETED', 'completed_at')) throw conflict();
        if (!await source.returnItem()) throw conflict();
        await source.audit(identity.id, 'CLAIM_COMPLETED', claimId, { itemId: String(itemId) });
        return claimDto(await source.findClaimForUpdate(claimId));
      });
    }
  };
}
