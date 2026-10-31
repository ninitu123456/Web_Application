import { transaction, query, databaseTimeout } from '../config/db.js';

const claimColumns = 'c.claim_id, c.claimant_id, c.item_id, c.proof_description, c.status, c.submitted_at, c.reviewed_at, c.completed_at';
export function createClaimRepository(pool) {
  return {
    async listMine(claimantId) {
      const [rows] = await query(pool, `SELECT ${claimColumns}, i.title AS item_title, i.type AS item_type, i.status AS item_status, i.event_date AS item_event_date, cat.name AS category_name, loc.name AS location_name FROM claims c JOIN items i ON i.item_id=c.item_id JOIN categories cat ON cat.category_id=i.category_id JOIN locations loc ON loc.location_id=i.location_id WHERE c.claimant_id = ? ORDER BY c.submitted_at DESC, c.claim_id DESC`, [claimantId]);
      return rows;
    },
    withLockedItem(itemId, operation) {
      return transaction(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[lockedItem]] = await run('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [itemId]);
        const source = {
          async findItem() {
            const [[item]] = await run('SELECT item_id, user_id, type, status FROM items WHERE item_id = ?', [itemId]);
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
          async listMine(claimantId) {
            const [rows] = await run(`SELECT ${claimColumns}, i.title AS item_title, i.type AS item_type, i.status AS item_status, i.event_date AS item_event_date, cat.name AS category_name, loc.name AS location_name FROM claims c JOIN items i ON i.item_id=c.item_id JOIN categories cat ON cat.category_id=i.category_id JOIN locations loc ON loc.location_id=i.location_id WHERE c.claimant_id = ? ORDER BY c.submitted_at DESC, c.claim_id DESC`, [claimantId]);
            return rows;
          },
          async listForItem() {
            const [rows] = await run(`SELECT ${claimColumns}, u.full_name AS claimant_name FROM claims c JOIN users u ON u.user_id=c.claimant_id WHERE c.item_id = ? ORDER BY c.submitted_at DESC, c.claim_id DESC`, [itemId]);
            return rows;
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
            return result.affectedRows;
          },
          async audit(actorId, action, claimId, details) {
            await run('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, \'CLAIM\', ?, ?, UTC_TIMESTAMP())', [actorId, action, claimId, JSON.stringify(details)]);
          }
        };
        if (!lockedItem) return operation(undefined);
        return operation(source);
      });
    },
    async findClaimItemId(claimId) {
      const [[row]] = await query(pool, 'SELECT item_id FROM claims WHERE claim_id = ?', [claimId]);
      return row?.item_id;
    }
  };
}
