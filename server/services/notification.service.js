import { HttpError } from '../utils/http-error.js';
import { notificationDto, paged } from '../utils/workflow-dto.js';

const messages = {
  ITEM_HIDDEN: 'Bài đăng đã được quản trị viên gỡ khỏi phần công khai',
  ITEM_RESTORED: 'Bài đăng đã được quản trị viên khôi phục hiển thị',
  ITEM_MODERATED_CLOSED: 'Bài đăng đã được quản trị viên đóng',
  CLAIM_ADMIN_RESOLVED: 'Quản trị viên đã xử lý yêu cầu nhận đồ',
  NEW_MATCH: 'Có gợi ý ghép nối mới', NEW_CLAIM: 'Có yêu cầu nhận đồ mới',
  CLAIM_APPROVED: 'Yêu cầu nhận đồ đã được chấp thuận', CLAIM_REJECTED: 'Yêu cầu nhận đồ đã bị từ chối',
  CLAIM_COMPLETED: 'Quá trình nhận lại đồ vật đã hoàn tất'
};
export function createNotificationService(repository) {
  return {
    // For events the repository MUST be bound to the caller's transaction executor.
    async emit(type, entityId, recipients, eventId = entityId) {
      if (!Object.hasOwn(messages, type)) throw new Error('Unknown notification event');
      for (const userId of [...new Set(recipients.map(String))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)) {
        await repository.insert(userId, type, `${messages[type]} (#${entityId}).`, `${type}:${eventId}`);
      }
    },
    async list(identity, options) { const { rows, total } = await repository.list(identity.id, options); return paged(rows, total, options, notificationDto); },
    async unread(identity) {
      const unreadCount = Number(await repository.unread(identity.id));
      if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) throw new Error('Unread count cannot be represented safely');
      return { unreadCount };
    },
    async markRead(identity, id) {
      const userId = await repository.owner(id);
      if (!userId) throw new HttpError(404, 'Không tìm thấy thông báo');
      if (String(userId) !== String(identity.id)) throw new HttpError(403, 'Không có quyền truy cập thông báo');
      await repository.markRead(identity.id, id);
    },
    async markAll(identity) { await repository.markAll(identity.id); }
  };
}
