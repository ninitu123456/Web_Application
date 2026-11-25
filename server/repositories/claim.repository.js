import { transaction, query, databaseTimeout } from '../config/db.js';
import { createNotificationRepository } from './notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';

import { readSnapshot } from '../config/read-snapshot.js';
import { deleteAiVisualCandidatesIfPresent } from '../ai-visual/invalidation.js';
import { bumpAiVisualCatalogRevision } from '../ai-visual/catalog-revision.js';
import { hiddenItemSql } from '../utils/item-visibility.js';

const claimColumns = 'c.claim_id, c.claimant_id, c.item_id, c.proof_description, c.status, c.submitted_at, c.reviewed_at, c.completed_at';
export function createClaimRepository(pool) {
  return {
    listMine(claimantId, options) {
      return readSnapshot(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[count]] = await run('SELECT COUNT(*) AS total FROM claims c WHERE c.claimant_id=?', [claimantId]);
        const [rows] = await run(`SELECT ${claimColumns}, i.title AS item_title, i.type AS item_type, i.status AS item_status, ${hiddenItemSql()} AS item_is_hidden, i.event_date AS item_event_date, cat.name AS category_name, loc.name AS location_name FROM claims c JOIN items i ON i.item_id=c.item_id JOIN categories cat ON cat.category_id=i.category_id JOIN locations loc ON loc.location_id=i.location_id WHERE c.claimant_id = ? ORDER BY c.submitted_at DESC, c.claim_id DESC LIMIT ? OFFSET ?`, [claimantId, options.limit, (options.page - 1) * options.limit]);
        return { rows, total: count.total };
      });
    },
    withLockedItem(itemId, operation, { snapshot = false } = {}) {
      return (snapshot ? readSnapshot : transaction)(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[lockedItem]] = await run('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [itemId]);
        const source = {
          async notifyClaim(type, claimId) {
            const [[row]] = await run('SELECT c.claimant_id, i.user_id FROM claims c JOIN items i ON i.item_id=c.item_id WHERE c.claim_id=?', [claimId]);
            await createNotificationService(createNotificationRepository(pool, run)).emit(type, claimId, [type === 'NEW_CLAIM' ? row.user_id : row.claimant_id]);
          },
          async findItem() {
            const [[item]] = await run(`SELECT i.item_id, i.user_id, i.type, i.status, ${hiddenItemSql()} AS is_hidden FROM items i WHERE i.item_id = ?`, [itemId]);
            return item;
          },
          async findClaimForUpdate(claimId) {
            const [[claim]] = await run(`SELECT ${claimColumns} FROM claims c WHERE c.claim_id = ? FOR UPDATE`, [claimId]);
            return claim;
          },
          async findClaimByClaimant(claimantId) {
            const [[claim]] = await run(`SELECT ${claimColumns} FROM claims c WHERE c.item_id = ? AND c.claimant_id = ?`, [itemId, claimantId]);
            return claim;
          },
          async activeClaimExists(exceptClaimId = null) {
            const [[row]] = await run("SELECT claim_id FROM claims WHERE item_id = ? AND status IN ('APPROVED','COMPLETED') AND (? IS NULL OR claim_id <> ?) LIMIT 1", [itemId, exceptClaimId, exceptClaimId]);
            return Boolean(row);
          },
          async createClaim(claimantId, proofDescription) {
            const [result] = await run("INSERT INTO claims (claimant_id, item_id, proof_description, status, submitted_at) VALUES (?, ?, ?, 'PENDING', UTC_TIMESTAMP())", [claimantId, itemId, proofDescription]);
            await run("UPDATE items SET status = 'CLAIM_PENDING', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'OPEN'", [itemId]);
            const [[claim]] = await run(`SELECT ${claimColumns} FROM claims c WHERE c.claim_id = ?`, [result.insertId]);
            return claim;
          },
          async listForItem(options) {
            const [[count]] = await run('SELECT COUNT(*) AS total FROM claims WHERE item_id=?', [itemId]);
            const [rows] = await run(`SELECT ${claimColumns}, u.full_name AS claimant_name FROM claims c JOIN users u ON u.user_id=c.claimant_id WHERE c.item_id = ? ORDER BY c.submitted_at DESC, c.claim_id DESC LIMIT ? OFFSET ?`, [itemId, options.limit, (options.page - 1) * options.limit]);
            if (rows.length) {
              const [answers] = await run(`SELECT a.claim_id, a.question_id, q.position, q.question, a.answer FROM claim_answers a JOIN item_verification_questions q ON q.question_id=a.question_id WHERE a.claim_id IN (${rows.map(() => '?').join(',')}) ORDER BY q.position`, rows.map((row) => row.claim_id));
              for (const row of rows) row.answers = answers.filter((answer) => String(answer.claim_id) === String(row.claim_id));
            }
            return { rows, total: count.total };
          },
          async questions() {
            const [rows] = await run('SELECT question_id, position, question FROM item_verification_questions WHERE item_id=? ORDER BY position', [itemId]);
            return rows;
          },
          async saveAnswers(claimId, answers) {
            for (const entry of answers) await run('INSERT INTO claim_answers (claim_id, question_id, answer, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [claimId, entry.questionId, entry.answer]);
          },
          async updateClaim(claimId, from, to, field) {
            const assignment = field === 'completed_at'
              ? "status = ?, completed_at = UTC_TIMESTAMP()"
              : "status = ?, reviewed_at = UTC_TIMESTAMP()";
            const [result] = await run(`UPDATE claims SET ${assignment} WHERE claim_id = ? AND status = ?`, [to, claimId, from]);
            return result.affectedRows;
          },
          async rejectOtherPending(selectedClaimId) {
            const [others] = await run("SELECT claim_id FROM claims WHERE item_id = ? AND claim_id <> ? AND status = 'PENDING' FOR UPDATE", [itemId, selectedClaimId]);
            if (others.length) await run("UPDATE claims SET status = 'REJECTED', reviewed_at = UTC_TIMESTAMP() WHERE item_id = ? AND claim_id <> ? AND status = 'PENDING'", [itemId, selectedClaimId]);
            return others.map((row) => row.claim_id);
          },
          async resetItemOpen() {
            const [[row]] = await run("SELECT claim_id FROM claims WHERE item_id = ? AND status IN ('PENDING','APPROVED') LIMIT 1", [itemId]);
            if (!row) await run("UPDATE items SET status = 'OPEN', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'CLAIM_PENDING'", [itemId]);
          },
          async claimItem() {
            const [result] = await run("UPDATE items SET status = 'CLAIMED', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'CLAIM_PENDING'", [itemId]);
            return result.affectedRows;
          },
          async returnItem() {
            const [result] = await run("UPDATE items SET status = 'RETURNED', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'CLAIMED'", [itemId]);
            if (result.affectedRows) await deleteAiVisualCandidatesIfPresent(run, itemId);
            return result.affectedRows;
          },
          async findHandover(claimId) {
            const [[row]] = await run('SELECT * FROM claim_handovers WHERE claim_id = ? FOR UPDATE', [claimId]);
            return row;
          },
          async saveHandover(claimId, fields) {
            const allowed = ['appointment_at', 'appointment_place', 'proposed_by', 'appointment_status', 'owner_confirmed_at', 'claimant_confirmed_at', 'dispute_reason', 'disputed_by', 'disputed_at', 'dispute_resolved_at'];
            const keys = Object.keys(fields).filter((key) => allowed.includes(key));
            const value = (key) => fields[key] === 'NOW' ? { sql: 'UTC_TIMESTAMP()', values: [] } : { sql: '?', values: [fields[key]] };
            await run('INSERT IGNORE INTO claim_handovers (claim_id, updated_at) VALUES (?, UTC_TIMESTAMP())', [claimId]);
            if (keys.length) {
              const parts = keys.map((key) => ({ key, ...value(key) }));
              await run(`UPDATE claim_handovers SET ${parts.map((part) => `${part.key} = ${part.sql}`).join(', ')}, updated_at = UTC_TIMESTAMP() WHERE claim_id = ?`, [...parts.flatMap((part) => part.values), claimId]);
            }
            const [[row]] = await run('SELECT * FROM claim_handovers WHERE claim_id = ?', [claimId]);
            return row;
          },
          async audit(actorId, action, claimId, details) {
            await run('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, \'CLAIM\', ?, ?, UTC_TIMESTAMP())', [actorId, action, claimId, JSON.stringify(details)]);
          }
        };
        if (!lockedItem) return operation(undefined);
        const result = await operation(source);
        if (!snapshot) await bumpAiVisualCatalogRevision(run);
        return result;
      });
    },
    async findClaimItemId(claimId) {
      const [[row]] = await query(pool, 'SELECT item_id FROM claims WHERE claim_id = ?', [claimId]);
      return row?.item_id;
    }
  };
}
