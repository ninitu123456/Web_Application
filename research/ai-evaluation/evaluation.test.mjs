import test from 'node:test';
import assert from 'node:assert/strict';
import {retrievalMetrics,validateManifest,thresholdMetrics} from './metrics.mjs';
import {normalizeEmbedding,cosineSimilarity,encodeEmbedding,decodeEmbedding,rankOppositeObjects} from '../../server/ai-visual/embeddings.js';
// Analytic unit fixtures only; never used as benchmark embeddings or results.
test('retrieval definitions, including one relevant result and rank beyond top five',()=>{
 const m=retrievalMetrics([1,2,3,6],6);
 assert.equal(m.recallAt1,.25); assert.equal(m.recallAt3,.75); assert.equal(m.recallAt5,.75);
 assert.equal(m.precisionAt3,.25); assert.equal(m.precisionAt5,.15);
 assert.ok(Math.abs(m.mrr-(1+1/2+1/3+1/6)/4)<1e-12);
 assert.throws(()=>retrievalMetrics([],50)); assert.throws(()=>retrievalMetrics([0],50)); assert.throws(()=>retrievalMetrics([51],50));
});
test('threshold uses inclusive >= and handles no accepted pair',()=>{
 const pairs=[{correct:true,similarity:.95},{correct:false,similarity:.96},{correct:true,similarity:.5},{correct:false,similarity:.2}];
 assert.deepEqual(thresholdMetrics(pairs,.95),{threshold:.95,tp:1,fp:1,tn:1,fn:1,precision:.5,recall:.5,falsePositiveRate:.5});
 assert.equal(thresholdMetrics(pairs,1).precision,null);
});
function manifest() {return [1,3,7,10].map((session,i)=>({image_id:`i${i}`,object_id:1,category_id:1,session_id:session,source_label:0,source_session:session,image_path:`data/i${i}.jpg`,role:i?'query':'gallery',source_dataset:'nhuy165/core50-sessions',source_revision:'r',source_row_idx:i,source_image_url:`https://datasets-server.huggingface.co/assets/x/--/r/--/default/train/${i}/image/image.jpg`,width:128,height:128,sha256:String(i).repeat(64),pixel_sha256:String(i+4).repeat(64)}));}
test('manifest rejects wrong object/category/session, missing labels, duplicate content and split leakage',()=>{
 assert.equal(validateManifest(manifest(),1).images,4);
 for(const change of [r=>r[1].object_id=0,r=>r[1].category_id=2,r=>r[1].session_id=1,r=>r[1].session_id=12,r=>r[1].sha256=r[0].sha256,r=>r[1].pixel_sha256=r[0].pixel_sha256,r=>r[1].source_row_idx=0,r=>r[1].role='gallery',r=>r[1].source_revision='other',r=>r[1].image_path='../image.jpg',r=>delete r[1].sha256]) {
  const rows=manifest(); change(rows); assert.throws(()=>validateManifest(rows,1));
 }
});
test('production normalization, binary round trip and cosine agree with analytic vectors',()=>{
 const x=Array(512).fill(0),y=Array(512).fill(0);x[0]=3;x[1]=4;y[0]=1;
 const a=decodeEmbedding(encodeEmbedding(x)),b=normalizeEmbedding(y);
 assert.ok(Math.abs(Math.hypot(...a)-1)<1e-7); assert.ok(Math.abs(cosineSimilarity(a,b)-.6)<1e-7);
 const rows=[{item_id:2,type:'FOUND',embedding_data:encodeEmbedding(y)}];
 assert.ok(Math.abs(rankOppositeObjects({itemId:1,type:'LOST',vector:a},rows)[0].score-.6)<1e-7);
});
