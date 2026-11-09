import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed as baselineSeed } from '../../database/seeds/sample.js';
import { fixtures, imageSubjects, marker } from '../../database/seeds/production-demo-data.js';
import { plan, seed, rollback, assetId } from '../../database/seeds/production-demo.js';

test('production demo is additive, atomic, repeatable, silent and precisely reversible on real isolated MySQL', {timeout:120000}, async t=>{
  const database=`findit_test_${randomBytes(12).toString('hex')}`;
  const c=await connect({...configFromEnv(),database},false);
  let created=false;
  const query=async(sql,values=[]) => (await c.query(sql,values))[0];
  const anchor='2026-11-09';
  const assets=Object.fromEntries(Object.keys(imageSubjects).map(key=>[key,{publicId:assetId(key),url:`https://res.cloudinary.com/unit-test/image/upload/v1/${assetId(key)}.png`}]));
  const hashes=await Promise.all([0,1].map(()=>bcrypt.hash(randomBytes(32).toString('hex'),12)));
  const input={anchor,assets,hashes};
  try {
    await query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);created=true;
    await query(`USE \`${database}\``);await migrate(c,database);
    await baselineSeed(c,database,{USER:{email:'ordinary@baseline.invalid',password:'unrelated-password'},ADMIN:{email:'admin@baseline.invalid',password:'unrelated-admin-password'}});
    await query("INSERT INTO locations(name) VALUES ('Tòa nhà C - UIT'),('Tòa nhà E - UIT')");
    const baselineUsers=await query('SELECT * FROM users ORDER BY user_id');
    const baselineItems=await query('SELECT * FROM items ORDER BY item_id');
    const baselineIds=baselineItems.map(i=>i.item_id);
    await t.test('plan reads only and accounts for all records',async()=>{
      const p=await plan(c,anchor);
      assert.deepEqual(p.summary,{itemsToInsert:30,imagesToInsert:30,usersToInsert:2,existing:0,lost:15,found:15,tables:['users','items','item_images','ai_visual_catalog_state']});
      assert.deepEqual(await query('SELECT * FROM items ORDER BY item_id'),baselineItems);
    });
    await t.test('a failure in the middle rolls back users, items and images',async()=>{
      const wrapped=new Proxy(c,{get(target,key){
        if(key==='query')return async(statement,values)=>{
          if(typeof statement==='object' && statement.sql.startsWith('INSERT INTO item_images'))throw new Error('Injected image insert failure');
          return target.query(statement,values);
        };
        const value=target[key];return typeof value==='function'?value.bind(target):value;
      }});
      await assert.rejects(seed(wrapped,input),/Injected/);
      assert.deepEqual(await query('SELECT * FROM items ORDER BY item_id'),baselineItems);
      assert.deepEqual(await query('SELECT * FROM users ORDER BY user_id'),baselineUsers);
      assert.equal(Number((await query('SELECT COUNT(*) AS n FROM item_images'))[0].n),0);
    });
    let ids;
    await t.test('inserts exactly 15 LOST / 15 FOUND and no messages or AI work',async()=>{
      const result=await seed(c,input);ids=result.itemIds;
      assert.equal(result.itemsToInsert,30);assert.equal(new Set(ids).size,30);
      const groups=await query('SELECT type,COUNT(*) n FROM items WHERE private_identifiers LIKE ? GROUP BY type',[`${marker}:%`]);
      assert.deepEqual(Object.fromEntries(groups.map(r=>[r.type,Number(r.n)])),{LOST:15,FOUND:15});
      assert.equal(Number((await query('SELECT COUNT(*) n FROM item_images'))[0].n),30);
      for(const table of ['matches','notifications','email_outbox','ai_visual_jobs','ai_visual_candidates','ai_visual_notification_outbox'])assert.equal(Number((await query(`SELECT COUNT(*) n FROM ${table}`))[0].n),0,table);
      assert.deepEqual(await query('SELECT * FROM users WHERE user_id IN (?,?) ORDER BY user_id',baselineUsers.map(u=>u.user_id)),baselineUsers);
      assert.deepEqual(await query(`SELECT * FROM items WHERE item_id IN (${baselineIds.map(()=>'?').join(',')}) ORDER BY item_id`,baselineIds),baselineItems);
    });
    await t.test('rerun preserves every demo field and does not bump catalog revision',async()=>{
      const before=await query('SELECT * FROM items ORDER BY item_id'),users=await query('SELECT * FROM users ORDER BY user_id'),revision=await query('SELECT revision FROM ai_visual_catalog_state');
      assert.equal((await seed(c,input)).itemsToInsert,0);
      assert.deepEqual(await query('SELECT * FROM items ORDER BY item_id'),before);
      assert.deepEqual(await query('SELECT * FROM users ORDER BY user_id'),users);
      assert.deepEqual(await query('SELECT revision FROM ai_visual_catalog_state'),revision);
    });
    await t.test('modified demo records are neither overwritten nor deleted',async()=>{
      await query("UPDATE items SET title='Changed by a user' WHERE item_id=?",[ids[0]]);
      await assert.rejects(seed(c,input),/conflict/);await assert.rejects(rollback(c,input),/conflict/);
      await query('UPDATE items SET title=? WHERE item_id=?',[fixtures[0].title,ids[0]]);
    });
    await t.test('real interactions block deletion and preserve the entire batch',async()=>{
      const result=await query("INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at) VALUES(?,?,?,'PENDING',UTC_TIMESTAMP())",[baselineUsers[0].user_id,ids[1],'Real interaction sentinel']);
      await assert.rejects(rollback(c,input),/related data in claims/);
      assert.equal((await plan(c,anchor,assets)).summary.existing,30);
      await query('DELETE FROM claims WHERE claim_id=?',[result.insertId]);
    });
    await t.test('rollback removes only exact demo entities; similarly named baseline survives',async()=>{
      const result=await rollback(c,input);assert.equal(result.itemsDeleted,30);assert.equal(result.usersDeleted,2);
      assert.deepEqual(await query('SELECT * FROM users ORDER BY user_id'),baselineUsers);
      assert.deepEqual(await query('SELECT * FROM items ORDER BY item_id'),baselineItems);
      assert.equal(Number((await query('SELECT COUNT(*) n FROM item_images'))[0].n),0);
      assert.equal((await rollback(c,input)).itemsDeleted,0);
    });
    await t.test('conflicting demo owner is never reused',async()=>{
      await query("UPDATE users SET email='lost-owner@demo.findit.invalid' WHERE user_id=?",[baselineUsers[0].user_id]);
      await assert.rejects(seed(c,input),/owner conflict/);
      assert.equal(Number((await query('SELECT COUNT(*) n FROM items'))[0].n),4);
    });
  } finally {
    if(created)await query(`DROP DATABASE \`${database}\``);
    await c.end();
  }
});
