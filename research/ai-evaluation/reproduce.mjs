import assert from 'node:assert/strict';
import {readFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,RESULTS,CACHE,sha256,saveJson} from './common.mjs';
const first=resolve(CACHE,'first-run');await mkdir(first,{recursive:true});
for(const file of ['metrics.json','retrieval_results.csv','latency_results.csv'])await copyFile(resolve(RESULTS,file),resolve(first,file));
await copyFile(resolve(CACHE,'embeddings.json'),resolve(first,'embeddings.json'));
const manifestHash=sha256(await readFile(resolve(RESULTS,'dataset_manifest.json')));
// Designated final report pass, regardless of latency relative to the first pass.
await new Promise((ok,fail)=>{const p=spawn(process.execPath,[resolve(ROOT,'evaluate.mjs')],{stdio:'inherit'});p.on('error',fail);p.on('exit',code=>code===0?ok():fail(new Error(`Second inference pass failed ${code}`)));});
const firstMetrics=JSON.parse(await readFile(resolve(first,'metrics.json'))),secondMetrics=JSON.parse(await readFile(resolve(RESULTS,'metrics.json')));
assert.deepEqual(firstMetrics.retrieval,secondMetrics.retrieval);assert.equal(firstMetrics.model.weightsSha256,secondMetrics.model.weightsSha256);
const a=JSON.parse(await readFile(resolve(first,'embeddings.json'))),b=JSON.parse(await readFile(resolve(CACHE,'embeddings.json')));
let maxEmbeddingDifference=0;for(const key of Object.keys(a)){assert.equal(a[key].length,512);for(let i=0;i<512;i++)maxEmbeddingDifference=Math.max(maxEmbeddingDifference,Math.abs(a[key][i]-b[key][i]));}
const aa=(await readFile(resolve(first,'retrieval_results.csv'),'utf8')).trim().split('\n');
const bb=(await readFile(resolve(RESULTS,'retrieval_results.csv'),'utf8')).trim().split('\n');assert.equal(aa.length,bb.length);
const header=aa[0].split(','),scoreIndex=header.indexOf('similarity');let maxSimilarityDifference=0;
for(let i=1;i<aa.length;i++){const x=aa[i].split(','),y=bb[i].split(',');for(let k=0;k<x.length;k++)if(k!==scoreIndex)assert.equal(x[k],y[k]);maxSimilarityDifference=Math.max(maxSimilarityDifference,Math.abs(Number(x[scoreIndex])-Number(y[scoreIndex])));}
assert.ok(maxEmbeddingDifference<=1e-6&&maxSimilarityDifference<=1e-6);
assert.equal(sha256(await readFile(resolve(RESULTS,'dataset_manifest.json'))),manifestHash);
await saveJson(resolve(RESULTS,'reproducibility.json'),{status:'PASS',fullInferencePasses:2,imagesPerPass:200,comparedPairs:aa.length-1,maxEmbeddingDifference,maxSimilarityDifference,retrievalMetricsIdentical:true,rankingIdentical:true,datasetManifestSha256:manifestHash,modelWeightsSha256:secondMetrics.model.weightsSha256,firstPass:{at:firstMetrics.generatedAtUtc,performance:firstMetrics.performance},secondPass:{at:secondMetrics.generatedAtUtc,performance:secondMetrics.performance},reportedPass:2,selectionPolicy:'Second full pass designated before running; not selected by speed'});
console.log('Full second inference pass reproducible',{maxEmbeddingDifference,maxSimilarityDifference});
