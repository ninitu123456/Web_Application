import { query, transaction, databaseTimeout } from '../config/db.js';
import { HttpError } from '../utils/http-error.js';

const forbidden = () => new HttpError(404, 'Không tìm thấy cuộc trò chuyện');
const messageDto = row => ({ id: String(row.message_id), conversationId: String(row.conversation_id), senderId: String(row.sender_id), clientId: row.client_id, content: row.content, createdAt: row.created_at });
export function createChatRepository(pool) {
  const member = async (run, id, userId, lock = false) => {
    const [[row]] = await run(`SELECT * FROM conversations WHERE conversation_id=? AND (user_low=? OR user_high=?)${lock ? ' FOR UPDATE' : ''}`, [id, userId, userId]);
    if (!row) throw forbidden();
    return row;
  };
  return {
    member: (id, userId) => member((sql, values) => query(pool, sql, values), id, userId),
    async create(userId, peerId) {
      return transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[peer]] = await run("SELECT user_id FROM users WHERE user_id=? AND account_status='ACTIVE'", [peerId]);
        if (!peer) throw new HttpError(404, 'Không tìm thấy người dùng');
        const [low, high] = [String(userId), String(peerId)].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        await run('INSERT INTO conversations (user_low,user_high,created_at,updated_at) VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE conversation_id=conversation_id', [low, high]);
        const [[row]] = await run('SELECT conversation_id FROM conversations WHERE user_low=? AND user_high=?', [low, high]);
        return { id: String(row.conversation_id) };
      });
    },
    async list(userId, before, limit) {
      const [rows] = await query(pool, `SELECT c.conversation_id, u.user_id AS peer_id, u.full_name,
        (SELECT content FROM messages WHERE conversation_id=c.conversation_id ORDER BY message_id DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages WHERE conversation_id=c.conversation_id ORDER BY message_id DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.conversation_id AND sender_id<>? AND message_id>IF(c.user_low=?,c.last_read_low,c.last_read_high)) AS unread_count
        FROM conversations c JOIN users u ON u.user_id=IF(c.user_low=?,c.user_high,c.user_low)
        WHERE (c.user_low=? OR c.user_high=?) AND c.conversation_id<? ORDER BY c.conversation_id DESC LIMIT ?`, [userId, userId, userId, userId, userId, before, limit]);
      return rows.map(row => ({ id: String(row.conversation_id), peer: { id: String(row.peer_id), fullName: row.full_name }, lastMessage: row.last_message, lastMessageAt: row.last_message_at, unreadCount: Number(row.unread_count) }));
    },
    async history(id, userId, before, limit, after) {
      await this.member(id, userId);
      const [rows] = after
        ? await query(pool, 'SELECT * FROM messages WHERE conversation_id=? AND message_id>? ORDER BY message_id ASC LIMIT ?', [id, after, limit])
        : await query(pool, 'SELECT * FROM messages WHERE conversation_id=? AND message_id<? ORDER BY message_id DESC LIMIT ?', [id, before, limit]);
      return rows.map(messageDto);
    },
    async send(id, userId, clientId, content) {
      return transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const chat = await member(run, id, userId, true);
        const [[existing]] = await run('SELECT * FROM messages WHERE sender_id=? AND client_id=?', [userId, clientId]);
        if (existing) {
          if (String(existing.conversation_id) !== id || existing.content !== content) throw new HttpError(409, 'Mã tin nhắn đã được sử dụng');
          return { message: messageDto(existing), recipients: [String(chat.user_low), String(chat.user_high)] };
        }
        const peerId = String(chat.user_low) === userId ? chat.user_high : chat.user_low;
        const [[peer]] = await run("SELECT user_id FROM users WHERE user_id=? AND account_status='ACTIVE'", [peerId]);
        if (!peer) throw new HttpError(403, 'Người dùng hiện không thể nhận tin nhắn');
        await run('INSERT INTO messages (conversation_id,sender_id,client_id,content,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())', [id, userId, clientId, content]);
        const [[row]] = await run('SELECT * FROM messages WHERE message_id=LAST_INSERT_ID()');
        await run('UPDATE conversations SET updated_at=UTC_TIMESTAMP() WHERE conversation_id=?', [id]);
        return { message: messageDto(row), recipients: [String(chat.user_low), String(chat.user_high)] };
      });
    },
    async read(id, userId, messageId) {
      const chat = await this.member(id, userId);
      const [[message]] = await query(pool, 'SELECT message_id FROM messages WHERE conversation_id=? AND message_id=?', [id, messageId]);
      if (!message) throw new HttpError(400, 'Tin nhắn không hợp lệ');
      const column = String(chat.user_low) === userId ? 'last_read_low' : 'last_read_high';
      const [result] = await query(pool, `UPDATE conversations SET ${column}=? WHERE conversation_id=? AND ${column}<?`, [messageId, id, messageId]);
      return result.affectedRows > 0;
    },
    async unread(userId) {
      const [[row]] = await query(pool, `SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON c.conversation_id=m.conversation_id
        WHERE (c.user_low=? OR c.user_high=?) AND m.sender_id<>? AND m.message_id>IF(c.user_low=?,c.last_read_low,c.last_read_high)`, [userId, userId, userId, userId]);
      return { unreadCount: Number(row.count) };
    }
  };
}
