import { createSuggestionsRepository } from '../repositories/suggestions.repository.js';
import { createSuggestionsService } from '../services/suggestions.service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { encodeEmbedding } from '../ai-visual/embeddings.js';

await assertIsolatedInstance();
test('visual suggestion API data query is owner scoped, read only, current, bounded, and safe without AI tables', { timeout: 60000 }, async () => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Requires the new disposable isolated MySQL runner.');
  const base = configFromEnv();
  const admin = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool;
  try {
    const [[mysqlIdentity]] = await admin.query('SELECT @@datadir AS datadir, @@port AS port');
    assert.equal(resolve(mysqlIdentity.datadir), resolve(process.env.FINDIT_ISOLATED_DATADIR));
    assert.equal(Number(mysqlIdentity.port), base.port);
    await admin.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await admin.query(`USE ${quote(name)}`);
    await migrate(admin, name);
    const password = randomBytes(18).toString('hex');
    await seed(admin, name, { USER: { email: 'user@visual-suggestions.example.test', password }, ADMIN: { email: 'admin@visual-suggestions.example.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [[user]] = await query(pool, "SELECT user_id FROM users WHERE email='user@visual-suggestions.example.test'");
    const [[adminUser]] = await query(pool, "SELECT user_id FROM users WHERE email='admin@visual-suggestions.example.test'");
    const [[category]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    const createItem = async (type, title, status = 'OPEN', ownerId = user.user_id) => {
      const [result] = await query(pool, `INSERT INTO items (user_id,category_id,location_id,title,description,type,color,private_identifiers,event_date,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'PRIVATE-DO-NOT-EXPOSE','2026-11-01',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [ownerId, category.category_id, location.location_id, title, `Public description ${title}`, type, 'Blue', status]);
      return String(result.insertId);
    };
    const addImage = async (itemId, embed = true) => {
      const [image] = await query(pool, 'INSERT INTO item_images (item_id,image_url,cloudinary_public_id,created_at) VALUES (?,?,?,UTC_TIMESTAMP())',
        [itemId, `https://images.example/${itemId}.jpg`, `fixture/${itemId}`]);
      if (embed) await query(pool, `INSERT INTO item_image_embeddings (image_id,model_id,model_revision,dimensions,embedding_data,created_at)
        VALUES (?,?,?,512,?,UTC_TIMESTAMP())`, [image.insertId, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f', encodeEmbedding([1, ...Array(511).fill(0)])]);
      if (embed) await query(pool, `INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at)
        VALUES(?,?,?,'COMPLETED',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [image.insertId, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f']);
      return image.insertId;
    };
    const lostId = await createItem('LOST', 'Private owner LOST item');
    const otherLostId = await createItem('LOST', 'Different owner LOST item', 'OPEN', adminUser.user_id);
    await addImage(lostId);
    const validFound = [];
    for (let i = 0; i < 4; i++) {
      const foundId = await createItem('FOUND', `Valid public FOUND ${i}`);
      await addImage(foundId);
      validFound.push(foundId);
    }
    const closed = await createItem('FOUND', 'Closed FOUND must not appear', 'CLOSED'); await addImage(closed);
    const wrongType = await createItem('LOST', 'Wrong direction must not appear'); await addImage(wrongType);
    const incomplete = await createItem('FOUND', 'Incomplete embedding must not appear'); await addImage(incomplete, false);
    for (const [index, foundId] of validFound.entries()) await query(pool, `INSERT INTO ai_visual_candidates (lost_item_id,found_item_id,model_id,model_revision,cosine_score,updated_at)
      VALUES (?,?,?,?,?,UTC_TIMESTAMP())`, [lostId, foundId, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f', 0.8 - index * 0.1]);
    for (const [target, score, modelId, revision] of [
      [closed, 0.99, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f'],
      [wrongType, 0.98, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f'],
      [incomplete, 0.97, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f'],
      [validFound[0], 0.96, 'old-model', 'old-revision']
    ]) await query(pool, `INSERT INTO ai_visual_candidates (lost_item_id,found_item_id,model_id,model_revision,cosine_score,updated_at)
      VALUES (?,?,?,?,?,UTC_TIMESTAMP())`, [lostId, target, modelId, revision, score]);

    const repository = createVisualSuggestionsRepository(pool);
    const service = createVisualSuggestionsService(repository, { enabled: true });
    const identity = { id: String(user.user_id), role: 'USER' };
    assert.deepEqual(await service.forOwner(identity, Number(otherLostId)).catch(error => error.status), 404);
    const [[before]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM matches) AS matches,(SELECT COUNT(*) FROM notifications) AS notifications,(SELECT COUNT(*) FROM claims) AS claims');
    const suggestions = await service.forOwner(identity, Number(lostId));
    assert.deepEqual(suggestions.map(row => row.itemId), validFound.slice(0, 3).map(Number));
    assert.equal(suggestions[0].cosineScore, 0.8);
    assert.equal(suggestions[0].thumbnailUrl, `https://images.example/${validFound[0]}.jpg`);
    assert.equal(JSON.stringify(suggestions).includes('PRIVATE-DO-NOT-EXPOSE'), false);
    assert.equal(JSON.stringify(suggestions).includes('embedding_data'), false);
    const [[after]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM matches) AS matches,(SELECT COUNT(*) FROM notifications) AS notifications,(SELECT COUNT(*) FROM claims) AS claims');
    assert.deepEqual(Object.values(after).map(Number), Object.values(before).map(Number));

    // A visual top-three overlap on different rule pages must be removed before
    // pagination, not hidden after slicing a page in the browser.
    for(const [index,found] of validFound.entries()) await query(pool,"INSERT INTO matches(lost_item_id,found_item_id,match_score,reasons,status,created_at) VALUES(?,?,?,?, 'POTENTIAL',UTC_TIMESTAMP())",[lostId,found,99-index,JSON.stringify(['Cùng danh mục'])]);
    const unified=createSuggestionsService(createSuggestionsRepository(pool,{visualEnabled:true}));
    const first=await unified.forOwner(identity,lostId,{page:1,limit:1,visual:true});
    assert.equal(first.data.visual.length,3);assert.equal(first.data.information.length,1);
    assert.equal(first.data.information[0].item.id,Number(validFound[3]));
    assert.equal(first.data.totalUnique,4);assert.equal(first.pagination.total,1);
    assert.ok(first.data.visual.every(row=>row.reasons.join(',')==='IMAGE,INFORMATION'));
    assert.equal(JSON.stringify(first).includes('cosineScore'),false);
    const second=await unified.forOwner(identity,lostId,{page:2,limit:1,visual:true});
    assert.deepEqual(second.data.information,[]);assert.equal(second.pagination.total,1);
    const withoutAi=[];
    for(let page=1;page<=4;page++){
      const result=await unified.forOwner(identity,lostId,{page,limit:1,visual:false});
      assert.equal(result.visualState,'disabled');assert.equal(result.data.totalUnique,4);
      withoutAi.push(...result.data.information.map(row=>row.item.id));
    }
    assert.equal(new Set(withoutAi).size,4);assert.deepEqual(new Set(withoutAi),new Set(validFound.map(Number)));
    await assert.rejects(()=>unified.forOwner({id:String(adminUser.user_id),role:'ADMIN'},lostId,{page:1,limit:6}),error=>error.status===404);
        await query(pool, 'DROP TABLE ai_visual_candidates');
    assert.deepEqual(await service.forOwner(identity, Number(lostId)), [], 'missing AI tables resolve to a safe empty result');
    await query(pool, "UPDATE items SET status='CLOSED' WHERE item_id=?", [lostId]);
    await assert.rejects(() => service.forOwner(identity, Number(lostId)), error => error.status === 404);
  } finally {
    if (pool) await pool.end();
    try { if (created) await admin.query(`DROP DATABASE ${quote(name)}`); }
    finally { await admin.end(); }
  }
});
