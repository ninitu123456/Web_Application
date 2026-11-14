import { query, databaseTimeout } from '../config/db.js';
import { readSnapshot } from '../config/read-snapshot.js';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { itemDto } from '../utils/item-dto.js';
import { createItemRepository } from './item.repository.js';
import { createVisualSuggestionsRepository } from './visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { HttpError } from '../utils/http-error.js';

const active="('OPEN','CLAIM_PENDING','CLAIMED')";
const missing=()=>new HttpError(404,'Không tìm thấy gợi ý');
export function similarityBand(score) {
  // Presentation bands only: uncalibrated on real photos, never a candidate filter.
  return score>=0.85?'VERY_HIGH':score>=0.70?'HIGH':'MEDIUM';
}
export function createSuggestionsRepository(pool, {visualEnabled=false,production=false}={}) {
  async function owned(run,id,owner) {
    const [[row]]=await run(`SELECT i.item_id,i.type FROM items i JOIN users u ON u.user_id=i.user_id
      WHERE i.item_id=? AND i.user_id=? AND i.status IN ${active} AND u.account_status='ACTIVE'
      AND ${hiddenItemSql()}=0`,[id,owner]);
    return row;
  }
  return {
    async isEligible(id,owner) {return Boolean(await owned((sql,values)=>query(pool,sql,values),id,owner));},
    async read(id,owner,{page,limit,visual=true}) {
      return readSnapshot(pool,async connection=>{
        const run=(sql,values=[])=>connection.query({sql,timeout:databaseTimeout},values);
        const source=await owned(run,id,owner);if(!source)throw missing();
        const items=createItemRepository(pool,run);
        let visualRows=[],visualState='disabled';
        if(visualEnabled&&visual) {
          const result=await createVisualSuggestionsService(createVisualSuggestionsRepository(pool,run),{enabled:true,production}).forOwner({id:owner,role:'USER'},id,{withState:true});
          visualRows=result.data;visualState=result.visualState;
        }
        const ids=[...new Set(visualRows.map(row=>row.itemId))];
        const from=`FROM matches m JOIN items l ON l.item_id=m.lost_item_id JOIN items f ON f.item_id=m.found_item_id
          JOIN users lu ON lu.user_id=l.user_id AND lu.account_status='ACTIVE'
          JOIN users fu ON fu.user_id=f.user_id AND fu.account_status='ACTIVE'
          JOIN items target ON target.item_id=CASE WHEN m.lost_item_id=? THEN m.found_item_id ELSE m.lost_item_id END
          WHERE (m.lost_item_id=? OR m.found_item_id=?) AND l.type='LOST' AND f.type='FOUND'
          AND l.status IN ${active} AND f.status IN ${active} AND m.match_score>=50
          AND ${hiddenItemSql('l.item_id')}=0 AND ${hiddenItemSql('f.item_id')}=0`;
        const base=[id,id,id];
        const fields='SELECT m.match_id,m.match_score,m.reasons,target.item_id ';
        const overlap=ids.length?(await run(fields+from+' AND target.item_id IN ('+ids.map(()=>'?').join(',')+')',[...base,...ids]))[0]:[];
        const exclusions=ids.length?' AND target.item_id NOT IN ('+ids.map(()=>'?').join(',')+')':'';
        const [[count]]=await run('SELECT COUNT(*) total '+from+exclusions,[...base,...ids]);
        const [rows]=await run(fields+from+exclusions+' ORDER BY m.match_score DESC,m.match_id ASC LIMIT ? OFFSET ?',[...base,...ids,limit,(page-1)*limit]);
        const entry=async(row,image)=>({
          item:itemDto(await items.findById(image?.itemId??row.item_id)),
          reasons:[...(image?['IMAGE']:[]),...(row?['INFORMATION']:[])],
          ...(image?{similarityBand:similarityBand(image.cosineScore)}:{}),
          ...(row?{informationScore:Number(row.match_score),informationReasons:typeof row.reasons==='string'?JSON.parse(row.reasons):row.reasons??[]}:{})
        });
        const visualEntries=await Promise.all(visualRows.map(image=>entry(overlap.find(row=>String(row.item_id)===String(image.itemId)),image)));
        const information=await Promise.all(rows.map(row=>entry(row)));
        const total=Number(count.total);
        return {data:{visual:visualEntries,information,totalUnique:total+visualEntries.length},visualState,
          pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
      });
    }
  };
}
