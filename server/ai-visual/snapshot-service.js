import { createHash, randomUUID } from 'node:crypto';
import { transaction, query, databaseTimeout } from '../config/db.js';
import { cosineSimilarity, decodeEmbedding } from './embeddings.js';
import { aiVisualEventKey, decideVisualNotification } from './notification-policy.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
const REVISION = '4c1807b705b1d015fb032789cc4d221b23025a6f';
const POLICY = 'unvalidated-no-production-policy-v1';
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createAiVisualSnapshotService(pool, flags = {}) {
  const enabled = flags.processingEnabled === true;
  const shadowMode = flags.shadowMode === true;
  const demoMode = flags.demoNotificationsEnabled === true;
  let lastScannedLostId = '0';

  async function manifestFor(lostId, catalogRevision) {
    if (catalogRevision === undefined) {
      const [[state]] = await query(pool, 'SELECT revision FROM ai_visual_catalog_state WHERE state_id=1');
      catalogRevision = String(state.revision);
    }
    const [[lost]] = await query(pool, `SELECT i.item_id,i.user_id,i.type,i.status,i.updated_at,u.account_status,p.enabled AS preference_enabled
      FROM items i JOIN users u ON u.user_id=i.user_id LEFT JOIN ai_visual_notification_preferences p ON p.user_id=i.user_id
      WHERE i.item_id=?`, [lostId]);
    if (!lost || lost.type !== 'LOST' || lost.status !== 'OPEN' || lost.account_status !== 'ACTIVE' || !lost.preference_enabled) return undefined;
    if (demoMode) {
      const [[markedLost]] = await query(pool, "SELECT demo_entity_id FROM ai_visual_demo_entities WHERE item_id=? AND user_id=? AND entity_role='LOST_ITEM' LIMIT 1", [lost.item_id, lost.user_id]);
      if (!markedLost) return undefined;
    }
    const [items] = await query(pool, `SELECT i.item_id,i.user_id,i.type,i.status,i.updated_at,u.account_status
      FROM items i JOIN users u ON u.user_id=i.user_id
      ${demoMode ? "JOIN ai_visual_demo_entities de ON de.item_id=i.item_id AND de.user_id=i.user_id AND de.entity_role='FOUND_ITEM'" : ''}
      WHERE i.type='FOUND' AND i.status='OPEN' AND u.account_status='ACTIVE' ORDER BY i.item_id`);
    const manifest = { catalogRevision: String(catalogRevision), lost: { id: String(lost.item_id), owner: String(lost.user_id), updated: String(lost.updated_at) }, found: [] };
    const all = [lost, ...items];
    for (const item of all) {
      const [images] = await query(pool, 'SELECT image_id FROM item_images WHERE item_id=? ORDER BY image_id', [item.item_id]);
      if (item === lost && images.length === 0) return undefined;
      if (item !== lost && images.length === 0) continue;
      manifest[item === lost ? 'lost' : 'found'][item === lost ? 'images' : manifest.found.length] = item === lost
        ? images.map((image) => String(image.image_id))
        : { id: String(item.item_id), owner: String(item.user_id), updated: String(item.updated_at), images: images.map((image) => String(image.image_id)) };
    }
    manifest.found.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    return manifest;
  }

  async function acquireSnapshot() {
    const coordinator = await pool.getConnection();
    let lockName;
    try {
      const [[database]] = await coordinator.query('SELECT DATABASE() AS database_name');
      lockName = `findit:ai-snapshot:${createHash('sha256').update(String(database.database_name)).digest('hex').slice(0, 40)}`;
      const [[lock]] = await coordinator.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
      if (Number(lock.acquired) !== 1) return undefined;
      return await transaction(pool, async (connection) => {
      const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
      let pagesScanned = 0;
      let wrapped = false;
      while (pagesScanned < 10) {
        const [lostRows] = await run(`SELECT i.item_id FROM items i JOIN users u ON u.user_id=i.user_id
          JOIN ai_visual_notification_preferences p ON p.user_id=i.user_id AND p.enabled=TRUE
          ${demoMode ? "JOIN ai_visual_demo_entities de ON de.item_id=i.item_id AND de.user_id=i.user_id AND de.entity_role='LOST_ITEM'" : ''}
          WHERE i.type='LOST' AND i.status='OPEN' AND u.account_status='ACTIVE' AND i.item_id>?
          ORDER BY i.item_id LIMIT 100`, [lastScannedLostId]);
        if (!lostRows.length) {
          if (lastScannedLostId !== '0' && !wrapped) {
            lastScannedLostId = '0';
            wrapped = true;
            continue;
          }
          return undefined;
        }
        pagesScanned++;
        for (const row of lostRows) {
        lastScannedLostId = String(row.item_id);
        const [[state]] = await run('SELECT revision FROM ai_visual_catalog_state WHERE state_id=1');
        const manifest = await manifestFor(row.item_id, String(state.revision));
        if (!manifest) continue;
        const hash = sha({ manifest, model: MODEL, revision: REVISION, policy: POLICY });
        const [[existing]] = await run('SELECT snapshot_id,state,manifest,locked_until FROM ai_visual_snapshots WHERE lost_item_id=? AND input_hash=? ORDER BY generation DESC LIMIT 1', [row.item_id, hash]);
        if (existing?.state === 'COMPLETE') continue;
        if (existing?.state === 'FAILED') {
          const failedManifest = typeof existing.manifest === 'string' ? JSON.parse(existing.manifest) : existing.manifest;
          const failedImageIds = [...failedManifest.lost.images, ...failedManifest.found.flatMap((item) => item.images)];
          const [jobs] = await run(`SELECT image_id,status FROM ai_visual_jobs WHERE image_id IN (${failedImageIds.map(() => '?').join(',')}) AND model_id=? AND model_revision=?`, [...failedImageIds, MODEL, REVISION]);
          const states = new Map(jobs.map((job) => [String(job.image_id), job.status]));
          if (failedImageIds.some((id) => !states.has(id) || ['FAILED', 'CANCELLED'].includes(states.get(id)))) continue;
        }
        if (existing?.state === 'PENDING' || existing?.state === 'PROCESSING') {
          if (existing.state === 'PROCESSING' && existing.locked_until && new Date(existing.locked_until).getTime() > Date.now()) continue;
          return { snapshotId: String(existing.snapshot_id), manifest: typeof existing.manifest === 'string' ? JSON.parse(existing.manifest) : existing.manifest, inputHash: hash };
        }
        const [[generation]] = await run('SELECT COALESCE(MAX(generation),0)+1 AS next_generation FROM ai_visual_snapshots WHERE lost_item_id=? FOR UPDATE', [row.item_id]);
        const [result] = await run(`INSERT INTO ai_visual_snapshots
          (lost_item_id,generation,state,model_id,model_revision,policy_version,input_hash,manifest,created_at,updated_at)
          VALUES (?,?,'PENDING',?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [row.item_id, generation.next_generation, MODEL, REVISION, POLICY, hash, JSON.stringify(manifest)]);
        return { snapshotId: String(result.insertId), manifest, inputHash: hash };
        }
      }
      return undefined;
      });
    } finally {
      if (lockName) await coordinator.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      coordinator.release();
    }
  }

  async function processSnapshot(snapshot) {
    const lease = randomUUID();
    const [claim] = await query(pool, `UPDATE ai_visual_snapshots SET state='PROCESSING',lease_token=?,locked_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),updated_at=UTC_TIMESTAMP()
      WHERE snapshot_id=? AND (state='PENDING' OR (state='PROCESSING' AND locked_until<=UTC_TIMESTAMP()))`, [lease, snapshot.snapshotId]);
    if (claim.affectedRows !== 1) return false;
    const ids = [...snapshot.manifest.lost.images, ...snapshot.manifest.found.flatMap((item) => item.images)];
    const [rows] = await query(pool, `SELECT j.image_id,j.status,e.dimensions,e.embedding_data FROM ai_visual_jobs j
      LEFT JOIN item_image_embeddings e ON e.image_id=j.image_id AND e.model_id=j.model_id AND e.model_revision=j.model_revision
      WHERE j.image_id IN (${ids.map(() => '?').join(',')}) AND j.model_id=? AND j.model_revision=?`, [...ids, MODEL, REVISION]);
    const byImage = new Map(rows.map((row) => [String(row.image_id), row]));
    const current = await manifestFor(snapshot.manifest.lost.id);
    if (!current || sha({ manifest: current, model: MODEL, revision: REVISION, policy: POLICY }) !== snapshot.inputHash) {
      await query(pool, "UPDATE ai_visual_snapshots SET state='INVALIDATED',lease_token=NULL,locked_until=NULL,failure_code='INPUT_CHANGED',updated_at=UTC_TIMESTAMP() WHERE snapshot_id=? AND lease_token=?", [snapshot.snapshotId, lease]);
      return true;
    }
    const terminalFailure = ids.some((id) => !byImage.has(id) || ['FAILED', 'CANCELLED'].includes(byImage.get(id)?.status));
    if (terminalFailure) {
      await query(pool, "UPDATE ai_visual_snapshots SET state='FAILED',lease_token=NULL,locked_until=NULL,failure_code='IMAGE_JOB_FAILED',updated_at=UTC_TIMESTAMP() WHERE snapshot_id=? AND lease_token=?", [snapshot.snapshotId, lease]);
      return true;
    }
    if (ids.some((id) => byImage.get(id)?.status !== 'COMPLETED' || Number(byImage.get(id)?.dimensions) !== 512 || !byImage.get(id)?.embedding_data)) {
      await query(pool, "UPDATE ai_visual_snapshots SET state='PENDING',lease_token=NULL,locked_until=NULL,updated_at=UTC_TIMESTAMP() WHERE snapshot_id=? AND lease_token=?", [snapshot.snapshotId, lease]);
      return false;
    }
    const vectors = new Map(ids.map((id) => [id, decodeEmbedding(byImage.get(id).embedding_data)]));
    const results = [];
    for (const found of snapshot.manifest.found) {
      let score = -1;
      for (const left of snapshot.manifest.lost.images) for (const right of found.images) score = Math.max(score, cosineSimilarity(vectors.get(left), vectors.get(right)));
      results.push({ itemId: found.id, owner: found.owner, score });
    }
    const result = await transaction(pool, async (connection) => {
      const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
      const [[locked]] = await run('SELECT state,lease_token,input_hash,locked_until FROM ai_visual_snapshots WHERE snapshot_id=? FOR UPDATE', [snapshot.snapshotId]);
      if (!locked || locked.state !== 'PROCESSING' || locked.lease_token !== lease || locked.input_hash !== snapshot.inputHash || new Date(locked.locked_until).getTime() <= Date.now()) return false;
      const [[catalog]] = await run('SELECT revision FROM ai_visual_catalog_state WHERE state_id=1 FOR UPDATE');
      const latest = await manifestFor(snapshot.manifest.lost.id, String(catalog.revision));
      if (!latest || sha({ manifest: latest, model: MODEL, revision: REVISION, policy: POLICY }) !== snapshot.inputHash) {
        await run("UPDATE ai_visual_snapshots SET state='INVALIDATED',lease_token=NULL,locked_until=NULL,failure_code='INPUT_CHANGED',updated_at=UTC_TIMESTAMP() WHERE snapshot_id=?", [snapshot.snapshotId]);
        return true;
      }
      for (const item of results) await run(`INSERT INTO ai_visual_snapshot_results (snapshot_id,found_item_id,cosine_score,created_at) VALUES (?,?,?,UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE cosine_score=VALUES(cosine_score),created_at=VALUES(created_at)`, [snapshot.snapshotId, item.itemId, item.score]);
      const [completed] = await run("UPDATE ai_visual_snapshots SET state='COMPLETE',lease_token=NULL,locked_until=NULL,completed_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE snapshot_id=? AND lease_token=? AND locked_until>UTC_TIMESTAMP()", [snapshot.snapshotId, lease]);
      if (completed.affectedRows !== 1) return false;
      for (const item of results) {
        const synthetic = demoMode && await isDemoPair(run, snapshot.manifest.lost.id, item.itemId, snapshot.manifest.lost.owner, item.owner);
        const decision = decideVisualNotification({ snapshotComplete: true, eligible: true, policyValidated: false, shadowMode, demoMode, synthetic, score: item.score, demoThreshold: flags.demoMinCosine });
        const eventKey = aiVisualEventKey(snapshot.manifest.lost.owner, snapshot.manifest.lost.id, item.itemId);
        await run(`INSERT IGNORE INTO ai_visual_notification_decisions
          (snapshot_id,recipient_id,lost_item_id,found_item_id,policy_version,disposition,reason_code,event_key,created_at)
          VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())`, [snapshot.snapshotId, snapshot.manifest.lost.owner, snapshot.manifest.lost.id, item.itemId,
          demoMode && synthetic ? `DEMO ONLY cosine >= ${flags.demoMinCosine}` : POLICY, decision.disposition, decision.reason, eventKey]);
        if (decision.disposition === 'DEMO_ELIGIBLE' && !shadowMode) await run(`INSERT IGNORE INTO ai_visual_notification_outbox
          (decision_id,event_key,status,available_at,created_at,updated_at)
          SELECT decision_id,CONCAT('AI_VISUAL_OUTBOX:',snapshot_id,':',event_key),'PENDING',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM ai_visual_notification_decisions
          WHERE snapshot_id=? AND recipient_id=? AND found_item_id=?`, [snapshot.snapshotId, snapshot.manifest.lost.owner, item.itemId]);
      }
      return true;
    });
    return result;
  }

  async function isDemoPair(run, lostId, foundId, lostOwner, foundOwner) {
    const [[match]] = await run(`SELECT li.run_id FROM ai_visual_demo_entities li
      JOIN ai_visual_demo_entities lo ON lo.run_id=li.run_id AND lo.entity_role='LOST_OWNER' AND lo.user_id=? AND lo.item_id IS NULL
      JOIN ai_visual_demo_entities fi ON fi.run_id=li.run_id AND fi.entity_role='FOUND_ITEM' AND fi.item_id=? AND fi.user_id=?
      JOIN ai_visual_demo_entities fo ON fo.run_id=li.run_id AND fo.entity_role='FOUND_OWNER' AND fo.user_id=? AND fo.item_id IS NULL
      WHERE li.run_id=fi.run_id AND li.entity_role='LOST_ITEM' AND li.item_id=? AND li.user_id=? LIMIT 1`,
    [lostOwner, foundId, foundOwner, foundOwner, lostId, lostOwner]);
    return Boolean(match);
  }

  async function processNext() {
    if (!enabled) return false;
    let snapshot = await acquireSnapshot();
    if (!snapshot) {
      const [rows] = await query(pool, `SELECT snapshot_id,manifest,input_hash FROM ai_visual_snapshots WHERE state='PENDING' OR (state='PROCESSING' AND (locked_until IS NULL OR locked_until<=UTC_TIMESTAMP()))
        ORDER BY snapshot_id LIMIT 1`);
      if (!rows.length) return false;
      snapshot = { snapshotId: String(rows[0].snapshot_id), manifest: typeof rows[0].manifest === 'string' ? JSON.parse(rows[0].manifest) : rows[0].manifest, inputHash: rows[0].input_hash };
    }
    return processSnapshot(snapshot);
  }

  async function deliverNextDemo() {
    if (!enabled || !demoMode || shadowMode) return false;
    return transaction(pool, async (connection) => {
      const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
      const [[catalog]] = await run('SELECT revision FROM ai_visual_catalog_state WHERE state_id=1 FOR UPDATE');
      const [rows] = await run(`SELECT o.outbox_id,o.decision_id,o.event_key,d.event_key AS pair_event_key,d.recipient_id,d.lost_item_id,d.found_item_id,d.snapshot_id,s.manifest
        FROM ai_visual_notification_outbox o JOIN ai_visual_notification_decisions d ON d.decision_id=o.decision_id
        JOIN ai_visual_snapshots s ON s.snapshot_id=d.snapshot_id AND s.state='COMPLETE'
        WHERE o.status='PENDING' AND d.disposition='DEMO_ELIGIBLE' ORDER BY o.outbox_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!rows.length) return false;
      const row = rows[0];
      const snapshotManifest = typeof row.manifest === 'string' ? JSON.parse(row.manifest) : row.manifest;
      if (String(snapshotManifest.catalogRevision) !== String(catalog.revision)) {
        await run("UPDATE ai_visual_notification_outbox SET status='SUPPRESSED',updated_at=UTC_TIMESTAMP() WHERE outbox_id=?", [row.outbox_id]);
        return true;
      }
      const [[eligibility]] = await run(`SELECT l.status AS lost_status,l.type AS lost_type,l.user_id AS lost_owner_id,lu.account_status AS lost_owner_status,
        p.enabled AS preference_enabled,f.status AS found_status,f.type AS found_type,fu.account_status AS found_owner_status
        ,f.user_id AS found_owner_id
        FROM items l JOIN users lu ON lu.user_id=l.user_id JOIN items f ON f.item_id=? JOIN users fu ON fu.user_id=f.user_id
        LEFT JOIN ai_visual_notification_preferences p ON p.user_id=lu.user_id WHERE l.item_id=?`, [row.found_item_id, row.lost_item_id]);
      const syntheticStillPresent = eligibility && (!demoMode || await isDemoPair(run, row.lost_item_id, row.found_item_id, eligibility.lost_owner_id, eligibility.found_owner_id));
      if (!eligibility || !syntheticStillPresent || eligibility.lost_status !== 'OPEN' || eligibility.found_status !== 'OPEN' || eligibility.lost_type !== 'LOST' || eligibility.found_type !== 'FOUND' || eligibility.lost_owner_status !== 'ACTIVE' || eligibility.found_owner_status !== 'ACTIVE' || !eligibility.preference_enabled) {
        await run("UPDATE ai_visual_notification_outbox SET status='SUPPRESSED',updated_at=UTC_TIMESTAMP() WHERE outbox_id=?", [row.outbox_id]);
        return true;
      }
      await run('INSERT IGNORE INTO ai_visual_pair_alerts (recipient_id,lost_item_id,found_item_id,event_key,delivered_at) VALUES (?,?,?,?,UTC_TIMESTAMP())', [row.recipient_id,row.lost_item_id,row.found_item_id,row.pair_event_key]);
      const [[alert]] = await run('SELECT alert_id FROM ai_visual_pair_alerts WHERE recipient_id=? AND lost_item_id=? AND found_item_id=?', [row.recipient_id,row.lost_item_id,row.found_item_id]);
      const [inserted] = await run(`INSERT IGNORE INTO notifications (user_id,type,message,event_key,is_read,created_at)
        VALUES (?,'AI_VISUAL_SIMILAR_ITEM','Có vật phẩm có hình ảnh tương tự với bài đăng của bạn. Hãy kiểm tra thông tin để xác minh.',?,FALSE,UTC_TIMESTAMP())`, [row.recipient_id,row.pair_event_key]);
      await run("UPDATE ai_visual_notification_outbox SET status='DELIVERED',updated_at=UTC_TIMESTAMP() WHERE outbox_id=?", [row.outbox_id]);
      return Boolean(alert && (inserted.affectedRows === 1 || inserted.affectedRows === 0));
    });
  }

  return { processNext, deliverNextDemo, flags: { processingEnabled: enabled, shadowMode, demoNotificationsEnabled: demoMode } };
}
