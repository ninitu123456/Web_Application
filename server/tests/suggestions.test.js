import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuggestionsService} from '../services/suggestions.service.js';
import {similarityBand} from '../repositories/suggestions.repository.js';
import {serve} from './helpers.js';
test('unified owner gate and post-read revocation do not leak data to ADMIN or former owner',async()=>{
 let checks=0,reads=0;const service=createSuggestionsService({async isEligible(_id,owner){return owner==='7'&&++checks<2;},async read(){reads++;return {data:{visual:[],information:[],totalUnique:0}};}});
 await assert.rejects(()=>service.forOwner({id:'9',role:'ADMIN'},1,{}),e=>e.status===404);assert.equal(reads,0);
 await assert.rejects(()=>service.forOwner({id:'7',role:'USER'},1,{}),e=>e.status===404);assert.equal(reads,1);
});
test('presentation bands do not filter candidates or alter matching thresholds',()=>{for(const [score,band]of [[-1,'MEDIUM'],[0.699,'MEDIUM'],[0.7,'HIGH'],[0.849,'HIGH'],[0.85,'VERY_HIGH'],[1,'VERY_HIGH']])assert.equal(similarityBand(score),band);});
test('unified endpoint requires auth, validates query and retains private no-store responses',async()=>{
 const seen=[];const http=await serve({healthService:{async check(){return {};}},authService:{async authenticate(){return {id:'7',role:'USER'};}},userService:{},itemService:{},suggestionsService:{async forOwner(...args){seen.push(args);return {data:{visual:[],information:[],totalUnique:0}};}}});
 try{const path=http.url+'/api/items/1/suggestions';assert.equal((await fetch(path)).status,401);
 const headers={Authorization:'Bearer valid'};
 for(const query of ['?visual=maybe','?visual=true&visual=false','?owner=8','?page=0'])assert.equal((await fetch(path+query,{headers})).status,400);
 const response=await fetch(path+'?page=2&limit=6&visual=false',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(seen[0][2],{page:2,limit:6,visual:false});
 }finally{await http.close();}
});
