import { query } from '../config/db.js';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { apiId } from '../utils/workflow-dto.js';

export function createNotificationRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    async insert(userId, type, message, eventKey) {
      try {
        await execute('INSERT INTO notifications (user_id, type, message, event_key, is_read, created_at) VALUES (?, ?, ?, ?, FALSE, UTC_TIMESTAMP())', [userId, type, message, eventKey]);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || !/uq_notifications_user_event/.test(error.sqlMessage ?? '')) throw error;
      }
    },
    async list(userId, { page, limit }) {
      const [[count]] = await execute('SELECT COUNT(*) AS total FROM notifications WHERE user_id=?', [userId]);
      const [rows] = await execute('SELECT notification_id, type, message, is_read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC, notification_id DESC LIMIT ? OFFSET ?', [userId, limit, (page - 1) * limit]);
      return { rows, total: count.total };
    },
    async resolveTarget(userId,id) {
      const [[notice]]=await execute('SELECT type,event_key FROM notifications WHERE notification_id=? AND user_id=?',[id,userId]);
      if(!notice)return;
      const active="('OPEN','CLAIM_PENDING','CLAIMED')";
      if(notice.type==='NEW_MATCH'||notice.type==='AI_VISUAL_SIMILAR_ITEM') {
        let from,values;
        if(notice.type==='NEW_MATCH') {
          const match=/^NEW_MATCH:([1-9][0-9]*)$/.exec(notice.event_key??'');if(!match)return;
          from='matches m';values=[userId,match[1],userId,userId];
        } else {from='ai_visual_pair_alerts m';values=[userId,notice.event_key,userId,userId];}
        const condition=notice.type==='NEW_MATCH'?'m.match_id=? AND m.match_score>=50':'m.event_key=? AND m.recipient_id='+ '?';
        if(notice.type!=='NEW_MATCH')values.splice(2,0,userId);
        const [[row]]=await execute(`SELECT CASE WHEN l.user_id=? THEN l.item_id ELSE f.item_id END item_id
          FROM ${from} JOIN items l ON l.item_id=m.lost_item_id JOIN items f ON f.item_id=m.found_item_id
          JOIN users lu ON lu.user_id=l.user_id AND lu.account_status='ACTIVE' JOIN users fu ON fu.user_id=f.user_id AND fu.account_status='ACTIVE'
          WHERE ${condition} AND (l.user_id=? OR f.user_id=?) AND l.type='LOST' AND f.type='FOUND'
          AND l.status IN ${active} AND f.status IN ${active} AND ${hiddenItemSql('l.item_id')}=0 AND ${hiddenItemSql('f.item_id')}=0`,values);
        if(row)return {kind:'SUGGESTIONS',itemId:apiId(row.item_id)};
        return;
      }
      const event=/^(NEW_CLAIM|CLAIM_APPROVED|CLAIM_REJECTED|CLAIM_COMPLETED):([1-9][0-9]*)$/.exec(notice.event_key??'');
      if(!event||event[1]!==notice.type)return;
      const [[claim]]=await execute(`SELECT c.claim_id,c.claimant_id,c.status,i.item_id,i.user_id,i.status item_status,${hiddenItemSql()} hidden,
        owner.account_status owner_status FROM claims c JOIN items i ON i.item_id=c.item_id AND i.type='FOUND' JOIN users owner ON owner.user_id=i.user_id
        WHERE c.claim_id=? AND (c.claimant_id=? OR i.user_id=?)`,[event[2],userId,userId]);
      if(!claim)return;
      if(notice.type==='NEW_CLAIM') {
        if(String(claim.user_id)!==String(userId))return;
        return {kind:'RECEIVED_CLAIM',itemId:apiId(claim.item_id),claimId:apiId(claim.claim_id)};
      }
      if(String(claim.claimant_id)!==String(userId))return;
      if(notice.type==='CLAIM_APPROVED'&&claim.status==='APPROVED'&&claim.item_status==='CLAIMED'&&!Number(claim.hidden)&&claim.owner_status==='ACTIVE')
        return {kind:'CLAIM_CONTACT',itemId:apiId(claim.item_id),claimId:apiId(claim.claim_id)};
      const [[position]]=await execute('SELECT COUNT(*) total FROM claims c JOIN claims target ON target.claim_id=? WHERE c.claimant_id=? AND (c.submitted_at>target.submitted_at OR (c.submitted_at=target.submitted_at AND c.claim_id>target.claim_id))',[claim.claim_id,userId]);
      return {kind:'CLAIM_HISTORY',claimId:apiId(claim.claim_id),page:Math.floor(Number(position.total)/10)+1};
    },
    async owner(id) { const [[row]] = await execute('SELECT user_id FROM notifications WHERE notification_id=?', [id]); return row?.user_id; },
    async markRead(userId, id) { await execute('UPDATE notifications SET is_read=TRUE WHERE notification_id=? AND user_id=? AND is_read=FALSE', [id, userId]); },
    async markAll(userId) { await execute('UPDATE notifications SET is_read=TRUE WHERE user_id=? AND is_read=FALSE', [userId]); },
    async unread(userId) { const [[row]] = await execute('SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=FALSE', [userId]); return row.total; }
  };
}
