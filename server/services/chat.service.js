import { HttpError } from '../utils/http-error.js';
export function chatId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) throw new HttpError(400, 'Mã không hợp lệ');
  return value;
}
export function chatPage(query = {}) {
  const limit = Number(query.limit ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Phân trang không hợp lệ');
  return { before: query.before === undefined ? '18446744073709551615' : chatId(query.before), limit };
}
export function validateMessage(body) {
  if (!body || typeof body.content !== 'string' || typeof body.clientId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.clientId)) throw new HttpError(400, 'Tin nhắn không hợp lệ');
  const content = body.content.trim();
  if (!content || Array.from(content).length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) throw new HttpError(400, 'Tin nhắn cần từ 1 đến 2000 ký tự');
  return { content, clientId: body.clientId.toLowerCase() };
}
// Bound memory; all transports use the same per-user budget in this process.
export function createChatService(repository) {
  let publish = () => {};
  const windows = new Map();
  const timer = setInterval(() => { for (const [key, value] of windows) if (Date.now() - value.start >= 60000) windows.delete(key); }, 60000);
  timer.unref();
  return {
    setPublisher(callback) { publish = callback; },
    close() { clearInterval(timer); },
    member: (identity, id) => repository.member(chatId(id), identity.id),
    create(identity, body) {
      const peer = chatId(String(body?.userId ?? ''));
      if (peer === identity.id) throw new HttpError(400, 'Không thể nhắn tin với chính mình');
      return repository.create(identity.id, peer);
    },
    list(identity, query) { const { before, limit } = chatPage(query); return repository.list(identity.id, before, limit); },
    history(identity, id, query = {}) { const { before, limit } = chatPage(query); return repository.history(chatId(id), identity.id, before, limit, query.after === undefined ? undefined : chatId(query.after)); },
    async send(identity, id, body) {
      const { content, clientId } = validateMessage(body);
      let window = windows.get(identity.id);
      if (!window || Date.now() - window.start >= 60000) { window = { start: Date.now(), count: 0 }; windows.set(identity.id, window); }
      if (++window.count > 30) throw new HttpError(429, 'Bạn gửi tin quá nhanh. Vui lòng thử lại sau.');
      const result = await repository.send(chatId(id), identity.id, clientId, content);
      publish(result.recipients, 'message:new', result.message);
      publish(result.recipients, 'conversation:updated', { id });
      return result.message;
    },
    async read(identity, id, body) {
      const changed = await repository.read(chatId(id), identity.id, chatId(String(body?.messageId ?? '')));
      if (changed) publish([identity.id], 'conversation:updated', { id });
    },
    unread: identity => repository.unread(identity.id)
  };
}
