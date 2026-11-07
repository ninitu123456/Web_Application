// Visibility is an append-only moderation stream in the existing activity log.
// Never purge ITEM_HIDDEN/ITEM_RESTORED events independently of their Item.
// Only trusted SQL column references are accepted; no request values enter SQL.
export function hiddenItemSql(reference = 'i.item_id') {
  if (!/^[a-z_]+\.[a-z_]+$/.test(reference)) throw new Error('Invalid Item column reference');
  // This uncorrelated aggregate is materialized once per query by MySQL,
  // avoiding a backwards scan of all audit events for every visible Item.
  return `(${reference} IN (SELECT visibility_log.entity_id FROM activity_logs visibility_log
    WHERE visibility_log.entity_type='ITEM' AND visibility_log.entity_id IS NOT NULL
    AND visibility_log.action IN ('ITEM_HIDDEN','ITEM_RESTORED') GROUP BY visibility_log.entity_id
    HAVING MAX(CASE WHEN visibility_log.action='ITEM_HIDDEN' THEN visibility_log.log_id ELSE 0 END)
      > MAX(CASE WHEN visibility_log.action='ITEM_RESTORED' THEN visibility_log.log_id ELSE 0 END)))`;
}
