import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixtures,imageSubjects,eventDate,demoOwners} from '../seeds/production-demo-data.js';
import {assetId} from '../seeds/production-demo.js';
test('reviewable demo has the requested category distribution, seven pairs and valid local imagery',async()=>{
  assert.equal(fixtures.length,30);assert.equal(new Set(fixtures.map(f=>f.key)).size,30);
  assert.equal(fixtures.filter(f=>f.type==='LOST').length,15);assert.equal(fixtures.filter(f=>f.type==='FOUND').length,15);
  const counts=Object.fromEntries(Object.keys(imageSubjects).map(key=>[key,fixtures.filter(f=>f.image===key).length]));
  assert.deepEqual(counts,{phone:4,laptop:3,headphones:4,bag:4,wallet:3,card:2,keys:2,bottle:3,books:3,accessory:2});
  const pairs=Object.groupBy(fixtures.filter(f=>f.pair),f=>f.pair);assert.equal(Object.keys(pairs).length,7);
  for(const pair of Object.values(pairs)) {
    assert.deepEqual(pair.map(f=>f.type).sort(),['FOUND','LOST']);
    assert.equal(pair[0].image,pair[1].image);assert.equal(pair[0].location,pair[1].location);
  }
  for(const f of fixtures) {assert.ok(f.title.startsWith('[DEMO]'));assert.ok(f.description.includes('ảnh minh họa tạo bằng AI'));assert.ok(f.title.length<=200);assert.ok(eventDate(f,'2026-11-09')<'2026-11-09');}
  assert.ok(demoOwners.every(o=>o.email.endsWith('.invalid')));
  for(const key of Object.keys(imageSubjects)) {
    assert.match(assetId(key),/^findit\/items\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
    const png=await readFile(new URL(`../demo-assets/${key}.png`,import.meta.url));
    assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>=1000);assert.ok(png.length<5*1024*1024);
  }
});
