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
  foreign: { fk_message_chat: fk('conversation_id', 'conversations', 'conversation_id'), fk_message_sender: fk('sender_id', 'users', 'user_id') } },
  { name: 'item_verification_questions', pk: 'question_id', columns: {
    question_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', item_id: ref, position: 'TINYINT UNSIGNED NOT NULL',
    question: 'VARCHAR(200) NOT NULL', created_at: 'DATETIME NOT NULL'
  }, unique: { uq_question_position: ['item_id', 'position'] },
  foreign: { fk_question_item: fk('item_id', 'items', 'item_id') },
  checks: { ck_question_position: 'position >= 1 AND position <= 3' } },
  { name: 'claim_answers', pk: 'answer_id', columns: {
    answer_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', claim_id: ref, question_id: ref,
    answer: 'VARCHAR(300) NOT NULL', created_at: 'DATETIME NOT NULL'
  }, unique: { uq_claim_answer: ['claim_id', 'question_id'] },
  foreign: { fk_answer_claim: fk('claim_id', 'claims', 'claim_id'), fk_answer_question: fk('question_id', 'item_verification_questions', 'question_id') } },
  { name: 'saved_items', pk: 'saved_id', columns: {
    saved_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', user_id: ref, item_id: ref, created_at: 'DATETIME NOT NULL'
  }, unique: { uq_saved_user_item: ['user_id', 'item_id'] },
  indexes: { idx_saved_user_recent: ['user_id', 'created_at', 'saved_id'] },
  foreign: { fk_saved_user: fk('user_id', 'users', 'user_id'), fk_saved_item: fk('item_id', 'items', 'item_id') } },
  { name: 'item_views', pk: 'view_id', columns: {
    view_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', item_id: ref, viewer_key: 'CHAR(64) NOT NULL', viewed_at: 'DATETIME NOT NULL'
  }, indexes: { idx_item_view_dedupe: ['item_id', 'viewer_key', 'viewed_at'] },
  foreign: { fk_view_item: fk('item_id', 'items', 'item_id') } },
  { name: 'contact_messages', pk: 'contact_id', columns: {
    contact_id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT', user_id: 'BIGINT UNSIGNED NULL',
    full_name: 'VARCHAR(100) NOT NULL', email: 'VARCHAR(255) NOT NULL',
    topic: "ENUM('GENERAL','ACCOUNT','ITEM','REPORT','OTHER') NOT NULL", body: 'VARCHAR(3000) NOT NULL',
    item_url: 'VARCHAR(500) NULL', status: "ENUM('NEW','HANDLED') NOT NULL DEFAULT 'NEW'",
    created_at: 'DATETIME NOT NULL', handled_at: 'DATETIME NULL', handled_by: 'BIGINT UNSIGNED NULL'
  }, indexes: { idx_contact_status: ['status', 'created_at', 'contact_id'] },
  foreign: { fk_contact_user: fk('user_id', 'users', 'user_id'), fk_contact_handler: fk('handled_by', 'users', 'user_id') } },
  { name: 'claim_handovers', pk: 'claim_id', columns: {
    claim_id: ref, appointment_at: 'DATETIME NULL', appointment_place: 'VARCHAR(200) NULL', proposed_by: 'BIGINT UNSIGNED NULL',
    appointment_status: "ENUM('NONE','PROPOSED','ACCEPTED') NOT NULL DEFAULT 'NONE'",
    owner_confirmed_at: 'DATETIME NULL', claimant_confirmed_at: 'DATETIME NULL',
    dispute_reason: 'VARCHAR(1000) NULL', disputed_by: 'BIGINT UNSIGNED NULL', disputed_at: 'DATETIME NULL',
    dispute_resolved_at: 'DATETIME NULL', updated_at: 'DATETIME NOT NULL'
  }, indexes: { idx_handover_dispute: ['disputed_at', 'dispute_resolved_at'] },
  foreign: { fk_handover_claim: fk('claim_id', 'claims', 'claim_id'), fk_handover_proposer: fk('proposed_by', 'users', 'user_id'), fk_handover_disputer: fk('disputed_by', 'users', 'user_id') } }
];
export const sessionAlter = 'ALTER TABLE `users` ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0;';
