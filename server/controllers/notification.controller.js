import { workflowId, pagination } from '../validation/workflow.validation.js';

export function createNotificationController(service) {
  return {
    async list(req, res) { res.json({ success: true, ...await service.list(req.user, pagination(req.query)) }); },
    async unread(req, res) { res.json({ success: true, data: await service.unread(req.user) }); },
    async markRead(req, res) { await service.markRead(req.user, workflowId(req.params.id)); res.json({ success: true, message: 'Đã đánh dấu thông báo là đã đọc' }); },
    async markAll(req, res) { await service.markAll(req.user); res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' }); }
  };
}
