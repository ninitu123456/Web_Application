// Additive feature manifest. Existing migrations remain byte-for-byte unchanged.
const ref = 'BIGINT UNSIGNED NOT NULL';
const fk = (column, table, target) => ({ column, table, target });
export const featureTables = [
  { name: 'password_reset_tokens', pk: 'token_hash', columns: {
    token_hash: 'CHAR(64) NOT NULL', user_id: ref, expires_at: 'DATETIME NOT NULL', created_at: 'DATETIME NOT NULL'
  }, foreign: { fk_reset_user: fk('user_id', 'users', 'user_id') } },
  { name: 'email_outbox', pk: 'job_id', columns: {
    job_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', user_id: ref, event_key: 'VARCHAR(100) NOT NULL',
    payload: 'JSON NOT NULL', status: "ENUM('PENDING','PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PENDING'",
    attempts: 'INT UNSIGNED NOT NULL DEFAULT 0', next_attempt_at: 'DATETIME NOT NULL',
    lease_token: 'CHAR(36) NULL', lease_until: 'DATETIME NULL', last_error: 'VARCHAR(50) NULL',
    created_at: 'DATETIME NOT NULL', sent_at: 'DATETIME NULL'
  }, unique: { uq_email_event: ['user_id', 'event_key'] },
  indexes: { idx_email_ready: ['status', 'next_attempt_at', 'job_id'], idx_email_lease: ['status', 'lease_until'] },
  foreign: { fk_email_user: fk('user_id', 'users', 'user_id') } },
  { name: 'conversations', pk: 'conversation_id', columns: {
    conversation_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', user_low: ref, user_high: ref,
    last_read_low: 'BIGINT UNSIGNED NOT NULL DEFAULT 0', last_read_high: 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
    created_at: 'DATETIME NOT NULL', updated_at: 'DATETIME NOT NULL'
  }, unique: { uq_conversation_pair: ['user_low', 'user_high'] },
  foreign: { fk_chat_low: fk('user_low', 'users', 'user_id'), fk_chat_high: fk('user_high', 'users', 'user_id') },
  checks: { ck_chat_distinct: 'user_low <> user_high' } },
  { name: 'messages', pk: 'message_id', columns: {
    message_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', conversation_id: ref, sender_id: ref,
    client_id: 'CHAR(36) NOT NULL', content: 'VARCHAR(2000) NOT NULL', created_at: 'DATETIME NOT NULL'
  }, unique: { uq_message_retry: ['sender_id', 'client_id'] },
  // Retain the published 018 migration's explicit FK index and index order.
  indexes: { idx_messages_conversation_id: ['conversation_id'], idx_message_history: ['conversation_id', 'message_id'], idx_message_unread: ['conversation_id', 'sender_id', 'message_id'] },
  foreign: { fk_message_chat: fk('conversation_id', 'conversations', 'conversation_id'), fk_message_sender: fk('sender_id', 'users', 'user_id') } }
];
export const sessionAlter = 'ALTER TABLE `users` ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0;';
