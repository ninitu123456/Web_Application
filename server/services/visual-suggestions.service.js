import { HttpError } from '../utils/http-error.js';
import { isMissingAiVisualTable } from '../repositories/visual-suggestions.repository.js';

const notFound = () => new HttpError(404, 'Không tìm thấy gợi ý hình ảnh');
function publicId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Suggestion item ID cannot be represented safely in the API');
  return id;
}

export function createVisualSuggestionsService(repository, { enabled = false, production = false } = {}) {
  return {
    async forOwner(identity, itemId, { withState = false } = {}) {
      if (!enabled) throw notFound();
      if (!identity || !['USER', 'ADMIN'].includes(identity.role)) throw new HttpError(401, 'Chưa xác thực hoặc token không hợp lệ');
      const eligible=repository.isEligibleOwnedItem??repository.isEligibleOwnedLostItem;
      const list=repository.listForOwnedItem??repository.listForLostItem;
      if (!await eligible.call(repository,itemId, identity.id)) throw notFound();
      let rows, state = 'ready';
      try {
        state = await repository.processingState?.(itemId) ?? 'ready';
        rows = await list.call(repository,itemId, 3, identity.id);
      }
      catch (error) {
        if (isMissingAiVisualTable(error) && !production) rows = [];
        else throw error;
      }
      // Revalidate after the reads; never disclose a source that became hidden.
      if (!await eligible.call(repository,itemId, identity.id)) throw notFound();
      const data = rows.map((row) => ({
        itemId: publicId(row.item_id),
        title: row.title,
        description: row.description,
        color: row.color,
        eventDate: row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : String(row.event_date).slice(0, 10),
        category: row.category_name,
        location: row.location_name,
        thumbnailUrl: row.thumbnail_url ?? null,
        cosineScore: Number(row.cosine_score)
      }));
      return withState ? { data, visualState: state } : data;
    }
  };
}
