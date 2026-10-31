// Additions are separate so migrations 001-012 keep their original SQL/checksums.
export const activeTargetExpression = "CASE WHEN status IN ('PENDING','REVIEWING') THEN CONCAT(target_type, ':', COALESCE(item_id, reported_user_id, claim_id)) ELSE NULL END";
export const phase5Additions = {
  notifications: {
    columns: { event_key: 'VARCHAR(100) NULL' },
    unique: { uq_notifications_user_event: ['user_id', 'event_key'] },
    indexes: { idx_notifications_user_read_created: ['user_id', 'is_read', 'created_at', 'notification_id'] }
  },
  reports: {
    columns: { active_target_key: `VARCHAR(64) GENERATED ALWAYS AS (${activeTargetExpression}) STORED` },
    unique: { uq_reports_active_target: ['reporter_id', 'active_target_key'] },
    indexes: {
      idx_reports_status_created: ['status', 'created_at', 'report_id'],
      idx_reports_reporter_created: ['reporter_id', 'created_at', 'report_id']
    }
  }
};
export function phase5Alter(tableName) {
  const addition = phase5Additions[tableName];
  const clauses = Object.entries(addition.columns).map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`);
  for (const [name, columns] of Object.entries(addition.unique)) clauses.push(`ADD UNIQUE KEY \`${name}\` (${columns.map((column) => `\`${column}\``).join(', ')})`);
  for (const [name, columns] of Object.entries(addition.indexes)) clauses.push(`ADD INDEX \`${name}\` (${columns.map((column) => `\`${column}\``).join(', ')})`);
  return `ALTER TABLE \`${tableName}\`\n  ${clauses.join(',\n  ')};`;
}
