import test from 'node:test';import assert from 'node:assert/strict';
import{createNotificationRepository}from'../repositories/notification.repository.js';
import{createNotificationService}from'../services/notification.service.js';
test('notification target resolves only the recipient structured event; never parses human message',async()=>{
 let notice={type:'NEW_MATCH',event_key:null},queries=[];
 const repository=createNotificationRepository(null,async(sql,values)=>{queries.push({sql,values});return sql.includes('FROM notifications')?[[notice]]:[[]]});
 const service=createNotificationService(repository);
 await assert.rejects(()=>service.target({id:2},5),error=>error.status===404);assert.equal(queries.length,1);
 assert.deepEqual(queries[0].values,[5,2]);
 notice={type:'NEW_MATCH',event_key:'NEW_MATCH:7 OR 1=1'};await assert.rejects(()=>service.target({id:2},5),error=>error.status===404);assert.equal(queries.length,2);
});
test('target absence, wrong recipient and missing underlying records return generic 404 without read side effects',async()=>{
 for(const type of ['NEW_MATCH','AI_VISUAL_SIMILAR_ITEM','CLAIM_APPROVED']){
 let updates=0;const service=createNotificationService(createNotificationRepository(null,async(sql)=>{if(/UPDATE|INSERT|DELETE/.test(sql))updates++;return sql.includes('FROM notifications')?[[{type,event_key:type+':9'}]]:[[]]}));
 await assert.rejects(()=>service.target({id:2},5),error=>error.status===404);assert.equal(updates,0);
 }
});
