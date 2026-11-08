// Physical interpretation of docs/erd.docx. No application workflow triggers.
const id = 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT';
const ref = 'BIGINT UNSIGNED NOT NULL';
const optionalRef = 'BIGINT UNSIGNED NULL';
const time = 'DATETIME NOT NULL';
const fk = (column, table, target) => ({ column, table, target });
export const tables = [
  { name: 'roles', pk: 'role_id', columns: {
    role_id: id, name: 'VARCHAR(20) NOT NULL'
  }, unique: { uq_roles_name: ['name'] } },
  { name: 'categories', pk: 'category_id', columns: {
    category_id: id, name: 'VARCHAR(100) NOT NULL', is_active: 'BOOLEAN NOT NULL DEFAULT TRUE'
  }, unique: { uq_categories_name: ['name'] } },
  { name: 'locations', pk: 'location_id', columns: {
    location_id: id, name: 'VARCHAR(150) NOT NULL', is_active: 'BOOLEAN NOT NULL DEFAULT TRUE'
  }, unique: { uq_locations_name: ['name'] } },
  { name: 'users', pk: 'user_id', columns: {
    user_id: id, role_id: ref, full_name: 'VARCHAR(150) NOT NULL', email: 'VARCHAR(255) NOT NULL',
    password_hash: 'VARCHAR(255) NOT NULL', student_code: 'VARCHAR(50) NULL',
    avatar_url: 'VARCHAR(1000) NULL', contact_info: 'TEXT NULL',
    account_status: "VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'", created_at: time, updated_at: time
  }, unique: { uq_users_email: ['email'], uq_users_student_code: ['student_code'] },
  foreign: { fk_users_role: fk('role_id', 'roles', 'role_id') } },
  { name: 'items', pk: 'item_id', columns: {
    item_id: id, user_id: ref, category_id: ref, location_id: ref,
    title: 'VARCHAR(200) NOT NULL', description: 'TEXT NOT NULL', type: "ENUM('LOST','FOUND') NOT NULL",
    color: 'VARCHAR(80) NULL', private_identifiers: 'TEXT NULL', event_date: 'DATE NOT NULL',
    status: "ENUM('OPEN','CLAIM_PENDING','CLAIMED','RETURNED','CLOSED') NOT NULL DEFAULT 'OPEN'",
    created_at: time, updated_at: time
  }, foreign: {
    fk_items_user: fk('user_id', 'users', 'user_id'),
    fk_items_category: fk('category_id', 'categories', 'category_id'),
    fk_items_location: fk('location_id', 'locations', 'location_id')
  } },
  { name: 'item_images', pk: 'image_id', columns: {
    image_id: id, item_id: ref, image_url: 'VARCHAR(1000) NOT NULL',
    cloudinary_public_id: 'VARCHAR(255) NULL', created_at: time
  }, foreign: { fk_images_item: fk('item_id', 'items', 'item_id') } },
  { name: 'matches', pk: 'match_id', columns: {
    match_id: id, lost_item_id: ref, found_item_id: ref, match_score: 'DECIMAL(5,2) NOT NULL',
    reasons: 'JSON NULL', status: "ENUM('POTENTIAL','CONFIRMED','REJECTED') NOT NULL DEFAULT 'POTENTIAL'", created_at: time
  }, unique: { uq_matches_pair: ['lost_item_id', 'found_item_id'] }, foreign: {
    fk_matches_lost: fk('lost_item_id', 'items', 'item_id'), fk_matches_found: fk('found_item_id', 'items', 'item_id')
  }, checks: {
    ck_matches_score: 'match_score >= 0 AND match_score <= 100',
    ck_matches_distinct: 'lost_item_id <> found_item_id'
  } },
  { name: 'claims', pk: 'claim_id', columns: {
    claim_id: id, claimant_id: ref, item_id: ref, proof_description: 'TEXT NOT NULL',
    status: "ENUM('PENDING','APPROVED','REJECTED','COMPLETED') NOT NULL DEFAULT 'PENDING'",
    submitted_at: time, reviewed_at: 'DATETIME NULL', completed_at: 'DATETIME NULL'
  }, unique: { uq_claims_claimant_item: ['claimant_id', 'item_id'] }, foreign: {
    fk_claims_claimant: fk('claimant_id', 'users', 'user_id'), fk_claims_item: fk('item_id', 'items', 'item_id')
  } },
  { name: 'notifications', pk: 'notification_id', columns: {
    notification_id: id, user_id: ref, type: 'VARCHAR(50) NOT NULL', message: 'TEXT NOT NULL',
    is_read: 'BOOLEAN NOT NULL DEFAULT FALSE', created_at: time
  }, foreign: { fk_notifications_user: fk('user_id', 'users', 'user_id') } },
  { name: 'reports', pk: 'report_id', columns: {
    report_id: id, reporter_id: ref, target_type: "ENUM('ITEM','USER','CLAIM') NOT NULL",
    item_id: optionalRef, reported_user_id: optionalRef, claim_id: optionalRef,
    reason: 'VARCHAR(50) NOT NULL', description: 'TEXT NULL',
    status: "ENUM('PENDING','REVIEWING','RESOLVED','DISMISSED') NOT NULL DEFAULT 'PENDING'",
    reviewed_by: optionalRef, reviewed_at: 'DATETIME NULL', created_at: time
  }, foreign: {
    fk_reports_reporter: fk('reporter_id', 'users', 'user_id'), fk_reports_item: fk('item_id', 'items', 'item_id'),
    fk_reports_user: fk('reported_user_id', 'users', 'user_id'), fk_reports_claim: fk('claim_id', 'claims', 'claim_id'),
    fk_reports_reviewer: fk('reviewed_by', 'users', 'user_id')
  }, checks: {
    ck_reports_target: "(target_type = 'ITEM' AND item_id IS NOT NULL AND reported_user_id IS NULL AND claim_id IS NULL) OR (target_type = 'USER' AND item_id IS NULL AND reported_user_id IS NOT NULL AND claim_id IS NULL) OR (target_type = 'CLAIM' AND item_id IS NULL AND reported_user_id IS NULL AND claim_id IS NOT NULL)"
  } },
  { name: 'activity_logs', pk: 'log_id', columns: {
    log_id: id, user_id: optionalRef, action: 'VARCHAR(100) NOT NULL', entity_type: 'VARCHAR(50) NOT NULL',
    entity_id: optionalRef, details: 'JSON NULL', created_at: time
  }, foreign: { fk_logs_user: fk('user_id', 'users', 'user_id') } },
  { name: 'item_image_embeddings', pk: 'embedding_id', columns: {
    embedding_id: id, image_id: ref, model_id: 'VARCHAR(120) NOT NULL', model_revision: 'VARCHAR(80) NOT NULL',
    dimensions: 'SMALLINT UNSIGNED NOT NULL', embedding_data: 'BLOB NOT NULL', created_at: time
  }, unique: { uq_image_embedding_model: ['image_id', 'model_id', 'model_revision'] }, foreign: {
    fk_embedding_image: fk('image_id', 'item_images', 'image_id')
  }, checks: { ck_embedding_dimensions: 'dimensions = 512' } },
  { name: 'ai_visual_jobs', pk: 'job_id', columns: {
    job_id: id, image_id: ref, model_id: 'VARCHAR(120) NOT NULL', model_revision: 'VARCHAR(80) NOT NULL',
    status: "ENUM('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED'",
    attempts: 'TINYINT UNSIGNED NOT NULL DEFAULT 0', available_at: time, locked_until: 'DATETIME NULL',
    lease_token: 'CHAR(36) NULL', last_error_code: 'VARCHAR(80) NULL', created_at: time, updated_at: time
  }, unique: { uq_ai_visual_job_image_model: ['image_id', 'model_id', 'model_revision'] }, foreign: {
    fk_ai_visual_job_image: fk('image_id', 'item_images', 'image_id')
  }, indexes: { idx_ai_visual_jobs_ready: ['status', 'available_at', 'job_id'] } },
  { name: 'ai_visual_candidates', pk: 'candidate_id', columns: {
    candidate_id: id, lost_item_id: ref, found_item_id: ref, model_id: 'VARCHAR(120) NOT NULL',
    model_revision: 'VARCHAR(80) NOT NULL', cosine_score: 'DOUBLE NOT NULL', updated_at: time
  }, unique: { uq_ai_visual_candidate_pair_model: ['lost_item_id', 'found_item_id', 'model_id', 'model_revision'] }, foreign: {
    fk_ai_visual_candidate_lost: fk('lost_item_id', 'items', 'item_id'),
    fk_ai_visual_candidate_found: fk('found_item_id', 'items', 'item_id')
  }, checks: { ck_ai_visual_distinct: 'lost_item_id <> found_item_id' } }
  ,{ name: 'ai_visual_catalog_state', pk: 'state_id', columns: {
    state_id: 'TINYINT UNSIGNED NOT NULL', revision: 'BIGINT UNSIGNED NOT NULL DEFAULT 0', updated_at: time
  }, checks: { ck_ai_visual_catalog_singleton: 'state_id = 1' } },
  { name: 'ai_visual_snapshots', pk: 'snapshot_id', columns: {
    snapshot_id: id, lost_item_id: ref, generation: 'BIGINT UNSIGNED NOT NULL', state: "ENUM('PENDING','PROCESSING','COMPLETE','INVALIDATED','FAILED') NOT NULL DEFAULT 'PENDING'",
    model_id: 'VARCHAR(120) NOT NULL', model_revision: 'VARCHAR(80) NOT NULL', policy_version: 'VARCHAR(80) NOT NULL',
    input_hash: 'CHAR(64) NOT NULL', manifest: 'JSON NOT NULL', lease_token: 'CHAR(36) NULL', locked_until: 'DATETIME NULL',
    failure_code: 'VARCHAR(80) NULL', created_at: time, updated_at: time, completed_at: 'DATETIME NULL'
  }, unique: { uq_ai_visual_snapshot_generation: ['lost_item_id', 'generation'] }, foreign: {
    fk_ai_visual_snapshot_lost: fk('lost_item_id', 'items', 'item_id')
  }, indexes: { idx_ai_visual_snapshot_work: ['state', 'updated_at', 'snapshot_id'] } },
  { name: 'ai_visual_snapshot_results', pk: 'result_id', columns: {
    result_id: id, snapshot_id: ref, found_item_id: ref, cosine_score: 'DOUBLE NOT NULL', created_at: time
  }, unique: { uq_ai_visual_snapshot_result_pair: ['snapshot_id', 'found_item_id'] }, foreign: {
    fk_ai_visual_result_snapshot: fk('snapshot_id', 'ai_visual_snapshots', 'snapshot_id'),
    fk_ai_visual_result_found: fk('found_item_id', 'items', 'item_id')
  } },
  { name: 'ai_visual_notification_preferences', pk: 'user_id', columns: {
    user_id: ref, enabled: 'BOOLEAN NOT NULL DEFAULT FALSE', updated_at: time
  }, foreign: { fk_ai_visual_preference_user: fk('user_id', 'users', 'user_id') } },
  { name: 'ai_visual_notification_decisions', pk: 'decision_id', columns: {
    decision_id: id, snapshot_id: ref, recipient_id: ref, lost_item_id: ref, found_item_id: ref,
    policy_version: 'VARCHAR(80) NOT NULL', disposition: "ENUM('ABSTAIN','SHADOW_CANDIDATE','DEMO_ELIGIBLE','SUPPRESSED') NOT NULL",
    reason_code: 'VARCHAR(80) NOT NULL', event_key: 'VARCHAR(160) NOT NULL', created_at: time
  }, unique: { uq_ai_visual_decision_snapshot_pair: ['snapshot_id', 'recipient_id', 'found_item_id'] }, foreign: {
    fk_ai_visual_decision_snapshot: fk('snapshot_id', 'ai_visual_snapshots', 'snapshot_id'),
    fk_ai_visual_decision_recipient: fk('recipient_id', 'users', 'user_id'), fk_ai_visual_decision_lost: fk('lost_item_id', 'items', 'item_id'),
    fk_ai_visual_decision_found: fk('found_item_id', 'items', 'item_id')
  }, indexes: { idx_ai_visual_decision_delivery: ['disposition', 'created_at'] } },
  { name: 'ai_visual_notification_outbox', pk: 'outbox_id', columns: {
    outbox_id: id, decision_id: ref, event_key: 'VARCHAR(160) NOT NULL', status: "ENUM('PENDING','PROCESSING','DELIVERED','SUPPRESSED','FAILED') NOT NULL DEFAULT 'PENDING'",
    attempts: 'TINYINT UNSIGNED NOT NULL DEFAULT 0', lease_token: 'CHAR(36) NULL', locked_until: 'DATETIME NULL',
    available_at: time, last_error_code: 'VARCHAR(80) NULL', created_at: time, updated_at: time
  }, unique: { uq_ai_visual_outbox_decision: ['decision_id'], uq_ai_visual_outbox_event: ['event_key'] }, foreign: {
    fk_ai_visual_outbox_decision: fk('decision_id', 'ai_visual_notification_decisions', 'decision_id')
  }, indexes: { idx_ai_visual_outbox_work: ['status', 'available_at', 'outbox_id'] } },
  { name: 'ai_visual_pair_alerts', pk: 'alert_id', columns: {
    alert_id: id, recipient_id: ref, lost_item_id: ref, found_item_id: ref, event_key: 'VARCHAR(160) NOT NULL', delivered_at: time
  }, unique: { uq_ai_visual_pair_alert_lifetime: ['recipient_id', 'lost_item_id', 'found_item_id'], uq_ai_visual_pair_alert_event: ['event_key'] }, foreign: {
    fk_ai_visual_alert_recipient: fk('recipient_id', 'users', 'user_id'), fk_ai_visual_alert_lost: fk('lost_item_id', 'items', 'item_id'),
    fk_ai_visual_alert_found: fk('found_item_id', 'items', 'item_id')
  } },
  { name: 'ai_visual_demo_entities', pk: 'demo_entity_id', columns: {
    demo_entity_id: id, run_id: 'CHAR(36) NOT NULL', user_id: optionalRef, item_id: optionalRef, entity_role: "ENUM('LOST_OWNER','FOUND_OWNER','LOST_ITEM','FOUND_ITEM') NOT NULL", created_at: time
  }, unique: { uq_ai_visual_demo_run_entity: ['run_id', 'entity_role', 'user_id', 'item_id'] }, foreign: {
    fk_ai_visual_demo_user: fk('user_id', 'users', 'user_id'), fk_ai_visual_demo_item: fk('item_id', 'items', 'item_id')
  }, indexes: { idx_ai_visual_demo_run: ['run_id', 'entity_role'] } }
];

export const metadata = {
  name: '_schema_migrations', pk: 'version', columns: {
    version: 'VARCHAR(100) NOT NULL', checksum: 'CHAR(64) NOT NULL',
    status: "ENUM('running','applied') NOT NULL", started_at: time, applied_at: 'DATETIME NULL'
  }
};
export const quote = (name) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Invalid SQL identifier');
  return '`' + name + '`';
};
export function indexes(table) {
  const result = { PRIMARY: { unique: true, columns: [table.pk] } };
  for (const [name, columns] of Object.entries(table.unique ?? {})) result[name] = { unique: true, columns };
  for (const [name, columns] of Object.entries(table.indexes ?? {})) result[name] = { unique: false, columns };
  for (const relation of Object.values(table.foreign ?? {})) {
    if (!Object.values(result).some((index) => index.columns[0] === relation.column)) {
      result[`idx_${table.name}_${relation.column}`] = { unique: false, columns: [relation.column] };
    }
  }
  return result;
}
export function createTable(table) {
  const definitions = Object.entries(table.columns).map(([name, type]) => `  ${quote(name)} ${type}`);
  for (const [name, index] of Object.entries(indexes(table))) {
    const columns = index.columns.map(quote).join(', ');
    definitions.push(name === 'PRIMARY' ? `  PRIMARY KEY (${columns})` :
      `  ${index.unique ? 'UNIQUE KEY' : 'KEY'} ${quote(name)} (${columns})`);
  }
  for (const [name, relation] of Object.entries(table.foreign ?? {})) {
    definitions.push(`  CONSTRAINT ${quote(name)} FOREIGN KEY (${quote(relation.column)}) REFERENCES ${quote(relation.table)} (${quote(relation.target)}) ON DELETE RESTRICT ON UPDATE RESTRICT`);
  }
  for (const [name, expression] of Object.entries(table.checks ?? {})) {
    definitions.push(`  CONSTRAINT ${quote(name)} CHECK (${expression})`);
  }
  return `CREATE TABLE ${quote(table.name)} (\n${definitions.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n`;
}
