// Only public Dataset Viewer rows and image assets; no full shards or credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {ROOT,RESULTS,DATA,CACHE,SEED,DATASET,DATASET_REVISION,CATEGORIES,sha256,saveJson,setup,csv} from './common.mjs';
await setup();
const budget=750_000_000;
let downloaded=0;
const requests=[];
async function get(url, attempts=5) {
 for(let attempt=0;attempt<attempts;attempt++) {
  try {
   const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
   if(Number(response.headers.get('content-length'))+downloaded>budget) throw new Error('DOWNLOAD_BUDGET_EXCEEDED');
   const chunks=[];
   for await(const chunk of response.body) { downloaded+=chunk.length; if(downloaded>budget) throw new Error('DOWNLOAD_BUDGET_EXCEEDED'); chunks.push(chunk); }
   const bytes=Buffer.concat(chunks);
   requests.push({url:url.split('?')[0],status:response.status,bytes:bytes.length});
   if(!response.ok) throw new Error(`HTTP ${response.status}: ${bytes.toString().slice(0,200)}`);
   return bytes;
  } catch(e) { if(e.message.includes('BUDGET') || attempt===attempts-1) throw e; console.log(`retry ${attempt+1}: ${e.message}`); await new Promise(r=>setTimeout(r,3000*(attempt+1))); }
 }
}
const info=JSON.parse(await get(`https://huggingface.co/api/datasets/${DATASET}`));
const revision=info.sha;
if(revision!==DATASET_REVISION)throw new Error('Dataset Viewer changed revision; do not silently mix snapshots. Use saved manifest/source snapshot.');
await writeFile(resolve(CACHE,'dataset-card.md'),await get(`https://huggingface.co/datasets/${DATASET}/raw/${revision}/README.md`));
await saveJson(resolve(RESULTS,'dataset_source.json'),{dataset:DATASET,revision,official:'https://vlomonaco.github.io/core50/',license:'CC-BY-4.0',seed:SEED});
const manifest=[];
const officialIndex=JSON.parse(await readFile(resolve(CACHE,'official-index.json')));
const starts=new Map();let cumulative=0;
for(let session=1;session<=11;session++)for(let object=1;object<=50;object++) {
 starts.set(`${object}:${session}`,cumulative);cumulative+=officialIndex[`${object}:${session}`].length;
}
if(cumulative!==164866)throw new Error('Official frame-count total mismatch');
try {
 for(let object=1;object<=50;object++) {
  for(const [i,session] of [1,3,7,10].entries()) {
   // Seeded interior frame ordinal avoids always taking the first video frame.
   const offset=40 + Number.parseInt(sha256(`${SEED}:${object}:${session}`).slice(0,8),16)%200;
   const id=`o${String(object).padStart(2,'0')}_s${String(session).padStart(2,'0')}`;
   const metaPath=resolve(CACHE,id+'.json');
   let meta;
   try {meta=JSON.parse(await readFile(metaPath));}catch{}
   if(!meta || meta.selection_method!=='official-counts-v1') {
    // Direct row access avoids the unavailable /filter index. The numeric
    // layout is only a proposed address; every returned source label is checked.
    const rowIndex=starts.get(`${object}:${session}`)+offset;
    const query=new URLSearchParams({dataset:DATASET,config:'default',split:'train',offset:String(rowIndex),length:'1'});
    const response=JSON.parse(await get('https://datasets-server.huggingface.co/rows?'+query));
    const row=response.rows?.[0];
    if(!row || row.row.label!==object-1 || row.row.session!==session) throw new Error(`Invalid source labels ${id}`);
    const src=row.row.image.src;
    if(!src.includes(`/--/${revision}/--/`)) throw new Error(`Viewer revision mismatch ${revision}`);
    const bytes=await get(src);
    const imagePath=`data/${id}.jpg`;
    const image=await sharp(bytes).metadata();
    const raw=await sharp(bytes).removeAlpha().raw().toBuffer();
    if(image.width!==128 || image.height!==128 || image.channels!==3) throw new Error(`Invalid RGB image ${id}`);
    await writeFile(resolve(ROOT,imagePath),bytes);
    meta={image_id:id,object_id:object,category_id:Math.ceil(object/5),category:CATEGORIES[Math.ceil(object/5)-1],session_id:session,image_path:imagePath,role:i===0?'gallery':'query',source_dataset:DATASET,source_revision:revision,source_row_idx:row.row_idx,source_label:row.row.label,source_session:row.row.session,selection_offset:offset,selection_method:'official-counts-v1',official_group_count:officialIndex[`${object}:${session}`].length,sha256:sha256(bytes),pixel_sha256:sha256(raw),width:image.width,height:image.height,source_image_url:src.split('?')[0],source_row_url:'https://datasets-server.huggingface.co/rows?'+query,encoding:'Dataset Viewer JPEG (not original PNG)'};
    await saveJson(metaPath,meta);
   }
   if(meta.source_revision!==revision) throw new Error('Cached dataset revision mismatch');
   manifest.push(meta);
  }
  console.log(`CORe50 ${object}/50 objects; ${manifest.length} images; ${(downloaded/1e6).toFixed(2)} MB transferred`);
 }
 await saveJson(resolve(RESULTS,'dataset_manifest.json'),manifest);
 await writeFile(resolve(RESULTS,'dataset_manifest.csv'),csv(manifest));
 await saveJson(resolve(RESULTS,'download_audit.json'),{status:'COMPLETE',dataset:DATASET,revision,downloadedBytesThisRun:downloaded,budgetBytes:budget,requests,selection:{seed:SEED,sessions:[1,3,7,10],gallerySession:1,querySessions:[3,7,10],rule:'frame offset = 40 + uint32(SHA256(seed:object:session)[0:8]) % 200; group starts are cumulative official paths.pkl frame counts in numeric session/object order; returned object/session labels MUST match'},imageEncoding:'HF Dataset Viewer JPEG, 128x128; no original-PNG equivalence claimed'});
} catch(error) {
 await saveJson(resolve(RESULTS,'download_audit.json'),{status:'PARTIAL',error:error.stack,downloadedBytesThisRun:downloaded,budgetBytes:budget,completedImages:manifest.length,requests});
 throw error;
}
