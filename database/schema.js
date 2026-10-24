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
  }, foreign: { fk_logs_user: fk('user_id', 'users', 'user_id') } }
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
