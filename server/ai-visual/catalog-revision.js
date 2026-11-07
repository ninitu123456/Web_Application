export async function bumpAiVisualCatalogRevision(execute) {
  await execute('UPDATE ai_visual_catalog_state SET revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE state_id=1');
}
