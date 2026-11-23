import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {ROOT,RESULTS,CACHE,SEED,sha256,stats,saveJson} from './common.mjs';
import {retrievalMetrics,validateManifest,thresholdMetrics} from './metrics.mjs';
import {cosineSimilarity} from '../../server/ai-visual/embeddings.js';
export function parseCsv(input) {
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<input.length;i++) {
  const c=input[i];
  if(c==='"') {if(quoted&&input[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n')){row.push(value);value='';if(c==='\n'){rows.push(row);row=[];}}
  else if(c!=='\r'||quoted)value+=c;
 }
 if(value||row.length){row.push(value);rows.push(row);}
 const [header,...data]=rows;return data.filter(r=>r.length>1).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]])));
}
const j=async name=>JSON.parse(await readFile(resolve(RESULTS,name)));
const manifest=await j('dataset_manifest.json'),metrics=await j('metrics.json');
const csvRows=async name=>parseCsv(await readFile(resolve(RESULTS,name),'utf8'));
validateManifest(manifest);
const mc=await csvRows('dataset_manifest.csv');
assert.equal(mc.length,manifest.length);
for(let i=0;i<mc.length;i++)for(const key of Object.keys(manifest[i]))assert.equal(mc[i][key],String(manifest[i][key]));
const official=JSON.parse(await readFile(resolve(CACHE,'official-index.json')));
const starts={};let start=0;for(let s=1;s<=11;s++)for(let o=1;o<=50;o++){starts[`${o}:${s}`]=start;start+=official[`${o}:${s}`].length;}
for(const row of manifest) {
 const offset=40+Number.parseInt(sha256(`${SEED}:${row.object_id}:${row.session_id}`).slice(0,8),16)%200;
 assert.equal(row.selection_offset,offset);assert.equal(row.source_row_idx,starts[`${row.object_id}:${row.session_id}`]+offset);
 const bytes=await readFile(resolve(ROOT,row.image_path));assert.equal(sha256(bytes),row.sha256);
 const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(sha256(data),row.pixel_sha256);assert.equal(info.channels,3);
}
const embeddings=JSON.parse(await readFile(resolve(CACHE,'embeddings.json')));
const results=await csvRows('retrieval_results.csv');
assert.equal(results.length,7500);
const gallery=manifest.filter(r=>r.role==='gallery'),queries=manifest.filter(r=>r.role==='query');
const expectedRanks=[];let maxDelta=0;
for(const q of queries) {
 const expected=gallery.map(g=>({id:g.image_id,object:g.object_id,score:cosineSimilarity(embeddings[q.image_id],embeddings[g.image_id])})).sort((a,b)=>b.score-a.score||a.object-b.object);
 const rows=results.filter(r=>r.query_id===q.image_id).sort((a,b)=>Number(a.rank)-Number(b.rank));
 const correctRank=expected.findIndex(r=>r.object===q.object_id)+1;expectedRanks.push(correctRank);
 assert.equal(rows.length,50);
 for(const [i,r] of rows.entries()) {
  assert.equal(Number(r.rank),i+1);assert.equal(r.gallery_id,expected[i].id);assert.equal(r.correct,String(expected[i].object===q.object_id));assert.equal(Number(r.correct_rank),correctRank);
  maxDelta=Math.max(maxDelta,Math.abs(Number(r.similarity)-expected[i].score));
 }
}
assert.ok(maxDelta<1e-12);assert.deepEqual(retrievalMetrics(expectedRanks,50),metrics.retrieval);
const pairs=results.map(r=>({similarity:Number(r.similarity),correct:r.correct==='true'}));
assert.deepEqual(thresholdMetrics(pairs,.95),metrics.thresholdAnalysis.demoOnlyThreshold);
const latency=await csvRows('latency_results.csv');assert.equal(latency.length,200);
for(const [key,col,role] of [['inference','inference_ms'],['embedding','embedding_ms'],['retrieval','retrieval_ms','query'],['queryEndToEnd','query_e2e_ms','query']]) {
 const vals=latency.filter(r=>!role||r.role===role).map(r=>Number(r[col]));
 assert.deepEqual(stats(vals),metrics.performance[key]);
}
const summary=await csvRows('metrics_summary.csv');
for(const row of summary){
 const expected=row.group==='retrieval'?metrics.retrieval[row.metric]:(()=>{const i=row.metric.lastIndexOf('_');return metrics.performance[row.metric.slice(0,i)][row.metric.slice(i+1)];})();
 assert.equal(Number(row.value),expected);
}
const bins=await csvRows('similarity_histogram.csv');let p=0,n=0;
for(const [i,b] of bins.entries()) {
 const inside=r=>Number(r.similarity)>=Number(b.bin_left)&&(i===bins.length-1?Number(r.similarity)<=Number(b.bin_right):Number(r.similarity)<Number(b.bin_right));
 assert.equal(results.filter(r=>r.correct==='true'&&inside(r)).length,Number(b.positive_count));
 assert.equal(results.filter(r=>r.correct==='false'&&inside(r)).length,Number(b.negative_count));
 p+=Number(b.positive_count);n+=Number(b.negative_count);
}
assert.equal(p,150);assert.equal(n,7350);
const examples=await j('selected_examples.json');
for(const e of examples.examples){const rs=results.filter(r=>r.query_id===e.query_id).slice(0,3);assert.equal(rs.length,3);for(let i=0;i<3;i++){assert.equal(rs[i].gallery_id,e.top3[i].gallery_id);assert.equal(Number(rs[i].similarity),e.top3[i].similarity);}}
const hashes={};for(const name of await readdir(RESULTS)){if(name.endsWith('.png')){const bytes=await readFile(resolve(RESULTS,name));const image=await sharp(bytes).metadata();assert.ok(image.width>500&&image.height>400);hashes[name]=sha256(bytes);}}
const before=metrics.verification.sourceHashes;for(const [name,hash] of Object.entries(before))assert.equal(sha256(await readFile(new URL('../../'+name,import.meta.url))),hash,'Production file changed');
const checks={status:'PASS',checkedImages:manifest.length,checkedPairs:results.length,checkedQueries:queries.length,metricCsvJsonAgreement:true,metricSummaryAgreement:true,latencyCsvJsonAgreement:true,histogramBinAgreement:true,deterministicSelection:true,productionSourcesUnchanged:true,maxSavedCosineDifference:maxDelta,chartSha256:hashes};
await saveJson(resolve(RESULTS,'independent_verification.json'),checks);console.log(JSON.stringify(checks,null,2));
