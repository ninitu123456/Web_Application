// Caller must hold the Item row lock in the same transaction. Schema discovery
// keeps terminal workflows usable with AI disabled and before AI migrations.
export async function deleteAiVisualCandidatesIfPresent(execute, itemId) {
  const [tables] = await execute(`SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_visual_candidates'`);
  if (tables.length) {
    await execute('DELETE FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?', [itemId, itemId]);
  }
}
