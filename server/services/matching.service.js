import { calculateMatchScore } from '../utils/match-score.js';
import { HttpError } from '../utils/http-error.js';

function publicId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Match ID cannot be represented safely in the API');
  return id;
}

export function createMatchingService(repository) {
  return {
    // Caller owns the database-wide matching lock and transaction.
    async synchronize(id) {
      const item = await repository.item(id, true);
      if (!item) throw new HttpError(404, 'Không tìm thấy Item');
      if (['CLOSED', 'RETURNED'].includes(item.status)) return;
      let after = '0';
      while (true) {
        const candidates = await repository.candidates(item, after);
        for (const candidate of candidates) {
          const result = calculateMatchScore(item, candidate);
          await repository.save(item.type === 'LOST' ? item.id : candidate.id, item.type === 'FOUND' ? item.id : candidate.id, result);
        }
        if (candidates.length < 100) break;
        after = candidates.at(-1).id;
      }
    },
    async list(id) {
      if (!await repository.item(id)) throw new HttpError(404, 'Không tìm thấy Item');
      return (await repository.list(id)).map((row) => ({
        matchId: publicId(row.matchId), itemId: publicId(row.itemId), score: Number(row.score),
        reasons: typeof row.reasons === 'string' ? JSON.parse(row.reasons) : row.reasons ?? []
      }));
    }
  };
}
