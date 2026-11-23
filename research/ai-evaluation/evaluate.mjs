// Offline benchmark. Imports pure encoder/math modules only, never application startup.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import sharp from 'sharp';
import { createClipEncoder } from '../../server/ai-visual/clip-encoder.js';
import {cosineSimilarity,encodeEmbedding,decodeEmbedding,rankOppositeObjects} from '../../server/ai-visual/embeddings.js';
import {CLIP_MODEL_ID,CLIP_MODEL_REVISION,CLIP_MODEL_DTYPE} from '../../server/ai-visual/config.js';
import { ROOT,RESULTS,CACHE,SEED,sha256,stats,saveJson,setup,csv } from './common.mjs';
import { retrievalMetrics,validateManifest,thresholdMetrics } from './metrics.mjs';
await setup();
const manifest=JSON.parse(await readFile(resolve(RESULTS,'dataset_manifest.json')));
const validation=validateManifest(manifest);
for(const row of manifest) {
 const bytes=await readFile(resolve(ROOT,row.image_path));
 const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(sha256(bytes)!==row.sha256||sha256(data)!==row.pixel_sha256||info.width!==128||info.height!==128||info.channels!==3) throw new Error(`Image integrity failure: ${row.image_id}`);
}
// Cache must already be prepared: model download cannot enter this measurement.
const {env}=await import('@huggingface/transformers'); env.allowRemoteModels=false;
const cacheDir=resolve(CACHE,'model');
const modelDir=resolve(cacheDir,CLIP_MODEL_ID,CLIP_MODEL_REVISION);
const preprocessor=JSON.parse(await readFile(resolve(modelDir,'preprocessor_config.json')));
const weights=await readFile(resolve(modelDir,'onnx/vision_model_quantized.onnx'));
const model={id:CLIP_MODEL_ID,revision:CLIP_MODEL_REVISION,dtype:CLIP_MODEL_DTYPE,dimensions:512,device:'cpu',intraOpNumThreads:1,interOpNumThreads:1,weightsBytes:weights.length,weightsSha256:sha256(weights),preprocessor};
const packageVersion=async name=>JSON.parse(await readFile(new URL(`../../node_modules/${name}/package.json`,import.meta.url))).version;
const sourceFiles=['server/ai-visual/clip-encoder.js','server/ai-visual/embeddings.js','server/ai-visual/config.js','server/ai-visual/notification-policy.js','server/ai-visual/snapshot-service.js','server/repositories/visual-suggestions.repository.js'];
const sourceHashes={};for(const file of sourceFiles) sourceHashes[file]=sha256(await readFile(new URL('../../'+file,import.meta.url)));
const encoderStart=performance.now();
let encoder;
try {
 encoder=await createClipEncoder({cacheDir});
 const initializationWallMs=performance.now()-encoderStart;
 const initializationMs=encoder.initializationMs;
 const warmups=[];
 for(let i=0;i<3;i++) {const started=performance.now();const r=await encoder.embedFile(resolve(ROOT,manifest[0].image_path));warmups.push({iteration:i,inferenceMs:r.inferenceMs,embeddingMs:performance.now()-started});}
 const vectors=new Map(),latency=[],norms=[];
 let peakObservedRss=process.memoryUsage().rss;
 const gallery=manifest.filter(x=>x.role==='gallery').sort((a,b)=>a.object_id-b.object_id);
 const queries=manifest.filter(x=>x.role==='query');
 async function embed(row) {
  const started=performance.now();const result=await encoder.embedFile(resolve(ROOT,row.image_path));
  const vector=decodeEmbedding(encodeEmbedding(result.vector)); // Same persisted float32 form as production snapshots.
  const elapsed=performance.now()-started;
  const norm=Math.hypot(...vector);if(vector.length!==512||!Number.isFinite(norm)||Math.abs(norm-1)>1e-6)throw new Error('Invalid real embedding');
  norms.push(norm);vectors.set(row.image_id,vector);
  return {result,vector,elapsed};
 }
 for(const row of gallery) {
  const e=await embed(row);const rssBytes=process.memoryUsage().rss;peakObservedRss=Math.max(peakObservedRss,rssBytes);
  latency.push({image_id:row.image_id,role:row.role,inference_ms:e.result.inferenceMs,embedding_ms:e.elapsed,retrieval_ms:null,query_e2e_ms:null,rss_bytes:rssBytes});
 }
 const galleryRows=gallery.map(r=>({item_id:r.object_id,type:'FOUND',embedding_data:encodeEmbedding(vectors.get(r.image_id))}));
 const retrieval=[],ranks=[],pairs=[];
 let maxCosineReferenceError=0,maxProductionRankingDifference=0;
 for(const [index,row] of queries.entries()) {
  const queryStart=performance.now();const e=await embed(row);const retrievalStart=performance.now();
  // No category filter; object IDs are candidate identifiers only, never model features.
  const ranking=gallery.map(g=>({gallery:g,similarity:cosineSimilarity(e.vector,vectors.get(g.image_id))})).sort((a,b)=>b.similarity-a.similarity||a.gallery.object_id-b.gallery.object_id);
  const retrievalMs=performance.now()-retrievalStart;
  const queryE2eMs=performance.now()-queryStart;
  const rssBytes=process.memoryUsage().rss;peakObservedRss=Math.max(peakObservedRss,rssBytes);
  latency.push({image_id:row.image_id,role:row.role,inference_ms:e.result.inferenceMs,embedding_ms:e.elapsed,retrieval_ms:retrievalMs,query_e2e_ms:queryE2eMs,rss_bytes:rssBytes});
  const prod=rankOppositeObjects({itemId:'query-'+row.image_id,type:'LOST',vector:e.vector},galleryRows).sort((a,b)=>b.score-a.score||Number(a.itemId)-Number(b.itemId));
  for(const [i,p] of prod.entries()) {
   if(p.itemId!==String(ranking[i].gallery.object_id))throw new Error('Production ranking parity failure');
   maxProductionRankingDifference=Math.max(maxProductionRankingDifference,Math.abs(p.score-ranking[i].similarity));
  }
  const correctRank=ranking.findIndex(x=>x.gallery.object_id===row.object_id)+1;ranks.push(correctRank);
  for(const [i,match] of ranking.entries()) {
   const other=vectors.get(match.gallery.image_id);
   const reference=Array.from(e.vector).reduce((s,v,k)=>s+v*other[k],0)/(Math.hypot(...e.vector)*Math.hypot(...other));
   maxCosineReferenceError=Math.max(maxCosineReferenceError,Math.abs(reference-match.similarity));
   const correct=match.gallery.object_id===row.object_id;
   const result={query_id:row.image_id,query_object_id:row.object_id,query_category_id:row.category_id,query_session_id:row.session_id,gallery_id:match.gallery.image_id,gallery_object_id:match.gallery.object_id,gallery_category_id:match.gallery.category_id,gallery_session_id:match.gallery.session_id,rank:i+1,similarity:match.similarity,correct,correct_rank:correctRank};
   retrieval.push(result);pairs.push({similarity:match.similarity,correct});
  }
  if((index+1)%25===0)console.log(`Real CLIP: ${gallery.length+index+1}/200; query ${index+1}/150`);
 }
 if(maxCosineReferenceError>1e-6||maxProductionRankingDifference>1e-6)throw new Error('Cosine equivalence failed');
 const repeat=await encoder.embedFile(resolve(ROOT,manifest[0].image_path));
 const repeatVector=decodeEmbedding(encodeEmbedding(repeat.vector));
 const repeatMaxAbsDifference=Math.max(...Array.from(repeatVector,(v,i)=>Math.abs(v-vectors.get(manifest[0].image_id)[i])));
 if(repeatMaxAbsDifference>1e-6)throw new Error('Repeat inference drift');
 const positives=pairs.filter(p=>p.correct).map(p=>p.similarity),negatives=pairs.filter(p=>!p.correct).map(p=>p.similarity);
 const top1=retrieval.filter(r=>r.rank===1),accepted=top1.filter(r=>r.similarity>=.95);
 const bySession={};for(const session of [3,7,10]) {const rs=retrieval.filter(r=>r.rank===1&&r.query_session_id===session);bySession[session]=retrievalMetrics(rs.map(r=>r.correct_rank),gallery.length);}
 const byCategory={};for(let category=1;category<=10;category++){const rs=top1.filter(r=>r.query_category_id===category);byCategory[category]=retrievalMetrics(rs.map(r=>r.correct_rank),gallery.length);}
 const metrics={status:'COMPLETE',generatedAtUtc:new Date().toISOString(),seed:SEED,dataset:validation,model,software:{node:process.version,transformers:await packageVersion('@huggingface/transformers'),onnxruntime:await packageVersion('onnxruntime-node'),sharp:await packageVersion('sharp')},hardware:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,ramBytes:os.totalmem(),platform:os.platform(),osRelease:os.release(),osVersion:os.version(),arch:os.arch(),device:'CPU only'},retrieval:retrievalMetrics(ranks,gallery.length),bySession,byCategory,similarity:{positive:stats(positives),negative:stats(negatives),negativeAboveMinPositive:negatives.filter(s=>s>=Math.min(...positives)).length,positiveBelowMaxNegative:positives.filter(s=>s<=Math.max(...negatives)).length,wrongTop1SameCategory:top1.filter(r=>!r.correct&&r.query_category_id===r.gallery_category_id).length,wrongTop1:top1.filter(r=>!r.correct).length},thresholdAnalysis:{productionIdentityThreshold:null,productionPolicy:'No validated cosine identity/notification threshold; rank top three',demoOnlyThreshold:thresholdMetrics(pairs,.95),demoOnlyTop1:{accepted:accepted.length,coverage:accepted.length/top1.length,correct:accepted.filter(r=>r.correct).length,precision:accepted.length?accepted.filter(r=>r.correct).length/accepted.length:null},calibrated:false},performance:{initializationMs,initializationWallMs,initializationDownloadExcluded:true,warmupImages:3,measuredImages:manifest.length,measuredQueries:queries.length,repetitions:1,inference:stats(latency.map(r=>r.inference_ms)),embedding:stats(latency.map(r=>r.embedding_ms)),retrieval:stats(latency.filter(r=>r.role==='query').map(r=>r.retrieval_ms)),queryEndToEnd:stats(latency.filter(r=>r.role==='query').map(r=>r.query_e2e_ms)),observedPeakRssBytes:peakObservedRss,processMaxRssBytes:process.resourceUsage().maxRSS*1024,warmups,timingNotes:'inference_ms is the production extractor timer: preprocessing + ONNX + output normalization; not isolated ONNX kernel time. embedding_ms also includes local file read/decode and persisted embedding conversion. query_e2e_ms measures embed + cosine and sort against 50 cached gallery vectors; excludes model startup, external storage, DB, HTTP and UI.'},verification:{...validation,embeddingNorm:stats(norms),maxCosineReferenceError,maxProductionRankingDifference,repeatMaxAbsDifference,rankingParityQueries:queries.length,pairs:pairs.length,sourceHashes,benchmarkImports:'Production createClipEncoder, cosineSimilarity, encodeEmbedding, decodeEmbedding and rankOppositeObjects; no dotenv, DB or application startup'}};
 await saveJson(resolve(RESULTS,'metrics.json'),metrics);
 await saveJson(resolve(CACHE,'embeddings.json'),Object.fromEntries([...vectors].map(([k,v])=>[k,Array.from(v)])));
 await writeFile(resolve(RESULTS,'retrieval_results.csv'),csv(retrieval));
 await writeFile(resolve(RESULTS,'latency_results.csv'),csv(latency));
 const summary=Object.entries(metrics.retrieval).map(([metric,value])=>({group:'retrieval',metric,value,unit:metric==='queries'||metric==='candidatesPerQuery'?'count':'ratio'}));
 for(const [metric,value] of Object.entries(metrics.performance))if(value?.count)for(const stat of ['mean','p50','p95'])summary.push({group:'latency',metric:metric+'_'+stat,value:value[stat],unit:'ms'});
 await writeFile(resolve(RESULTS,'metrics_summary.csv'),csv(summary));
 await saveJson(resolve(RESULTS,'verification.json'),metrics.verification);
 console.log(JSON.stringify({retrieval:metrics.retrieval,performance:metrics.performance,verification:metrics.verification},null,2));
} catch(error) {
 await saveJson(resolve(RESULTS,'failure.json'),{status:'FAILED',error:error.stack,time:new Date().toISOString()});throw error;
} finally {await encoder?.dispose();}
