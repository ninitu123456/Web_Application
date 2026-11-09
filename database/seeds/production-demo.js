import { createHash } from 'node:crypto';
import { marker, fixtures, demoOwners, eventDate } from './production-demo-data.js';

const fail = message => { throw new Error(message); };
const quote = name => /^[a-z_]+$/i.test(name) ? `\`${name}\`` : fail('Unsafe schema identifier');
const keyOf = fixture => `${marker}:${fixture.key}`;
export function assetId(image) {
  const hex = createHash('sha256').update(`${marker}:image:${image}`).digest('hex');
  return `findit/items/${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const all = async (c, sql, values = []) => (await c.query({ sql, timeout: 10000 }, values))[0];
function assertOwner(user, expected, role) {
  if (!user || !expected || user.email !== expected.email || user.full_name !== expected.fullName || user.contact_info !== marker ||
      String(user.role_id) !== String(role) || user.account_status !== 'ACTIVE' || user.student_code !== null || user.avatar_url !== null) fail('Demo owner conflict; no account overwritten');
}
function assertItem(item, fixture, owner, category, location, anchor) {
  const expected = { user_id:owner, category_id:category, location_id:location, title:fixture.title, description:fixture.description,
    type:fixture.type, color:fixture.color, private_identifiers:keyOf(fixture), event_date:eventDate(fixture,anchor), status:'OPEN' };
  for (const [field,value] of Object.entries(expected)) {
    const actual = item[field] instanceof Date ? item[field].toISOString().slice(0,10) : item[field];
    if (String(actual) !== String(value)) fail(`Demo item conflict: ${fixture.key}/${field}; no record overwritten`);
  }
}
export async function inspect(c) {
  const [identity] = await all(c, 'SELECT DATABASE() AS db, @@server_uuid AS serverUuid, @@version AS version, @@read_only AS readOnly');
  const [counts] = await all(c, 'SELECT (SELECT COUNT(*) FROM items) AS items,(SELECT COUNT(*) FROM item_images) AS images,(SELECT COUNT(*) FROM users) AS users');
  const categories = await all(c, 'SELECT category_id,name,is_active FROM categories ORDER BY category_id');
  const locations = await all(c, 'SELECT location_id,name,is_active FROM locations ORDER BY location_id');
  const roles = await all(c, "SELECT role_id FROM roles WHERE name='USER'");
  if (roles.length !== 1) fail('Missing ordinary USER role');
  const tables = await all(c, 'SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  if (tables.some(row => row.ENGINE !== 'InnoDB')) fail('Non-transactional table detected');
  const triggers = await all(c, 'SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
  const events = await all(c, "SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() AND STATUS='ENABLED'");
  if (triggers.length || events.length) fail('Database triggers/events need manual review');
  const [catalog] = await all(c, 'SELECT state_id,revision FROM ai_visual_catalog_state WHERE state_id=1');
  if (!catalog) fail('Missing AI catalog seed; no migration will be run');
  // The caller verifies the complete deployed migration manifest as well.
  const ledger = await all(c, 'SELECT version,checksum,status FROM _schema_migrations ORDER BY version');
  if (ledger.some(row=>row.status!=='applied')) fail('Migration in progress');
  const grants = await all(c, 'SHOW GRANTS FOR CURRENT_USER');
  return { identity,counts,categories,locations,role:roles[0].role_id,ledger,grants };
}
export async function plan(c, anchor, assets) {
  const info = await inspect(c);
  const owners = [];
  for (const owner of demoOwners) {
    const rows = await all(c, 'SELECT * FROM users WHERE email=?', [owner.email]);
    if (rows.length) assertOwner(rows[0],owner,info.role);
    owners.push(rows[0]);
  }
  const found = await all(c, 'SELECT * FROM items WHERE private_identifiers LIKE ?', [`${marker}:%`]);
  const byKey = new Map();
  for (const row of found) {
    if (byKey.has(row.private_identifiers) || !fixtures.some(f=>keyOf(f)===row.private_identifiers)) fail('Unknown or duplicate demo marker');
    byKey.set(row.private_identifiers,row);
  }
  const mapped = [];
  for (const f of fixtures) {
    const category = info.categories.find(r=>r.name===f.category && Number(r.is_active)===1);
    const location = info.locations.find(r=>r.name===f.location && Number(r.is_active)===1);
    if (!category || !location) fail(`Missing active lookup for ${f.key}`);
    const asset = assets?.[f.image];
    if (assets && (!asset || asset.publicId!==assetId(f.image) || !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(asset.url))) fail(`Invalid uploaded asset for ${f.image}`);
    const item = byKey.get(keyOf(f)), ownerIndex = f.type==='LOST' ? 0 : 1;
    if (item) {
      if (!owners[ownerIndex]) fail('Demo item has no recognized owner');
      assertItem(item,f,owners[ownerIndex].user_id,category.category_id,location.location_id,anchor);
      const images=await all(c,'SELECT * FROM item_images WHERE item_id=?',[item.item_id]);
      if (images.length!==1 || images[0].cloudinary_public_id!==assetId(f.image) || (asset && images[0].image_url!==asset.url)) fail('Demo image changed; no record overwritten');
    }
    mapped.push({fixture:f,category:category.category_id,location:location.location_id,ownerIndex,item});
  }
  return {info,owners,mapped,summary:{itemsToInsert:30-found.length,imagesToInsert:30-found.length,usersToInsert:owners.filter(r=>!r).length,existing:found.length,lost:15,found:15,tables:['users','items','item_images','ai_visual_catalog_state']}};
}
async function locked(c, task) {
  const [{name}] = await all(c,'SELECT DATABASE() AS name');
  const locks = [`${marker}:seed`, `findit:match:${createHash('sha256').update(name).digest('hex').slice(0,48)}`];
  const held=[];
  try {
    for(const lock of locks) {
      const [row]=await all(c,'SELECT GET_LOCK(?,2) AS acquired',[lock]);
      if(Number(row.acquired)!==1) fail('Demo/matching lock busy');
      held.push(lock);
    }
    await c.beginTransaction();
    try { const result=await task(); await c.commit(); return result; }
    catch(error) { await c.rollback(); throw error; }
  } finally { for(const lock of held.reverse()) await all(c,'SELECT RELEASE_LOCK(?)',[lock]); }
}
export async function seed(c,{anchor,assets,hashes}) {
  if(!assets || !hashes || hashes.length!==2 || hashes.some(h=>!/^\$2[aby]\$12\$/.test(h))) fail('Uploaded assets and random bcrypt password hashes required');
  return locked(c,async()=>{
    const p=await plan(c,anchor,assets);
    for(let index=0;index<demoOwners.length;index++) {
      if(p.owners[index]) continue;
      const o=demoOwners[index];
      const result=await all(c,`INSERT INTO users(role_id,full_name,email,password_hash,contact_info,account_status,created_at,updated_at)
        VALUES(?,?,?,?,?,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[p.info.role,o.fullName,o.email,hashes[index],marker]);
      p.owners[index]={user_id:String(result.insertId)};
    }
    for(const m of p.mapped) {
      if(m.item) continue;
      const f=m.fixture;
      const result=await all(c,`INSERT INTO items(user_id,category_id,location_id,title,description,type,color,private_identifiers,event_date,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[p.owners[m.ownerIndex].user_id,m.category,m.location,f.title,f.description,f.type,f.color,keyOf(f),eventDate(f,anchor)]);
      const asset=assets[f.image];
      await all(c,'INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at) VALUES(?,?,?,UTC_TIMESTAMP())',[result.insertId,asset.url,asset.publicId]);
    }
    if(p.summary.itemsToInsert) await all(c,'UPDATE ai_visual_catalog_state SET revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE state_id=1');
    const verified=await plan(c,anchor,assets);
    if(verified.summary.existing!==30) fail('Post-insert verification failed');
    return {...p.summary,itemIds:verified.mapped.map(m=>String(m.item.item_id))};
  });
}
// Fail closed if anybody has interacted with demo entities, including new FK
// tables introduced after this script was written. Never delete a real claim,
// report, notification, match, chat or AI result as an incidental cascade.
async function assertNoDependents(c,table,column,ids,allowed=[]) {
  if(!ids.length)return;
  const refs=await all(c,`SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME=? AND REFERENCED_COLUMN_NAME=?`,[table,column]);
  for(const ref of refs) {
    if(allowed.includes(ref.t))continue;
    const [row]=await all(c,`SELECT COUNT(*) AS n FROM ${quote(ref.t)} WHERE ${quote(ref.c)} IN (${ids.map(()=>'?').join(',')})`,ids);
    if(Number(row.n))fail(`Rollback blocked by related data in ${ref.t}; preserve it for review`);
  }
}
export async function rollback(c,{anchor,assets}) {
  return locked(c,async()=>{
    const p=await plan(c,anchor,assets);
    const ids=p.mapped.filter(m=>m.item).map(m=>m.item.item_id);
    const owners=p.owners.filter(Boolean).map(o=>o.user_id);
    if(ids.length && ids.length!==30)fail('Partial demo batch; review before rollback');
    if(ids.length) {
      const currentItems=await all(c,`SELECT * FROM items WHERE item_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
      for(const item of currentItems) {
        const m=p.mapped.find(m=>String(m.item?.item_id)===String(item.item_id));
        assertItem(item,m.fixture,p.owners[m.ownerIndex].user_id,m.category,m.location,anchor);
      }
      // Recheck after row locks: a user may have edited a row while the locks
      // were being acquired after the first snapshot.
      await plan(c,anchor,assets);
      const images=await all(c,`SELECT * FROM item_images WHERE item_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
      if(images.length!==30)fail('Demo image count changed during rollback');
      for(const image of images) {
        const m=p.mapped.find(m=>String(m.item?.item_id)===String(image.item_id));
        const expected=assets?.[m.fixture.image];
        if(image.cloudinary_public_id!==assetId(m.fixture.image) || (expected && image.image_url!==expected.url))fail('Demo image changed during rollback');
      }
      await assertNoDependents(c,'item_images','image_id',images.map(i=>i.image_id));
      await assertNoDependents(c,'items','item_id',ids,['item_images']);
      await all(c,`DELETE FROM item_images WHERE item_id IN (${ids.map(()=>'?').join(',')})`,ids);
      await all(c,`DELETE FROM items WHERE item_id IN (${ids.map(()=>'?').join(',')})`,ids);
      await all(c,'UPDATE ai_visual_catalog_state SET revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE state_id=1');
    }
    for(const owner of owners) {
      const [current]=await all(c,'SELECT * FROM users WHERE user_id=? FOR UPDATE',[owner]);
      assertOwner(current,demoOwners.find(o=>o.email===current?.email),p.info.role);
      await assertNoDependents(c,'users','user_id',[owner]);
      await all(c,'DELETE FROM users WHERE user_id=?',[owner]);
    }
    return {itemsDeleted:ids.length,imagesDeleted:ids.length,usersDeleted:owners.length,cloudinaryAssetsRetained:true};
  });
}
