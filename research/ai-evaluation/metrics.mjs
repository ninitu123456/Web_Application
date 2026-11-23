export function retrievalMetrics(ranks, candidateCount) {
 if(!ranks.length || !Number.isInteger(candidateCount) || candidateCount<1) throw new Error('Invalid evaluation size');
 if(ranks.some(r=>!Number.isInteger(r)||r<1||r>candidateCount)) throw new Error('Invalid ground-truth rank');
 const m={queries:ranks.length,candidatesPerQuery:candidateCount};
 for(const k of [1,3,5]) { m[`recallAt${k}`]=ranks.filter(r=>r<=Math.min(k,candidateCount)).length/ranks.length; m[`precisionAt${k}`]=m[`recallAt${k}`]/k; }
 m.mrr=ranks.reduce((sum,r)=>sum+1/r,0)/ranks.length;
 return m;
}
export function validateManifest(rows, expectedObjects=50) {
 if(rows.length!==expectedObjects*4) throw new Error('Expected four images per object');
 for(const key of ['image_id','image_path','source_row_idx','sha256','pixel_sha256']) {
  if(rows.some(r=>r[key]===undefined||r[key]==='') || new Set(rows.map(r=>r[key])).size!==rows.length) throw new Error(`Missing or duplicate ${key}`);
 }
 const revisions=new Set(rows.map(r=>r.source_revision));
 if(revisions.size!==1||!rows[0].source_revision) throw new Error('Mixed or missing source revision');
 const objects=new Map();
 for(const r of rows) {
  if(!Number.isInteger(r.object_id)||r.object_id<1||r.object_id>50) throw new Error('Invalid object ID');
  if(!Number.isInteger(r.session_id)||r.session_id<1||r.session_id>11) throw new Error('Invalid session ID');
  if(r.category_id!==Math.ceil(r.object_id/5)) throw new Error('Invalid category');
  if(!['gallery','query'].includes(r.role)||r.width!==128||r.height!==128) throw new Error('Invalid image/role');
  if(r.source_dataset!=='nhuy165/core50-sessions') throw new Error('Invalid dataset');
  if(r.source_label!==r.object_id-1 || r.source_session!==r.session_id) throw new Error('Source labels mismatch');
  if(!/^[a-f0-9]{64}$/.test(r.sha256)||!/^[a-f0-9]{64}$/.test(r.pixel_sha256)) throw new Error('Invalid checksum');
  if(r.image_path.includes('..')||!/^data\/[\w-]+\.jpg$/.test(r.image_path)) throw new Error('Invalid image path');
  if(!r.source_image_url.includes(`/--/${r.source_revision}/--/default/train/${r.source_row_idx}/image/`)) throw new Error('Source row identity mismatch');
  const list=objects.get(r.object_id)??[]; list.push(r); objects.set(r.object_id,list);
 }
 if(objects.size!==expectedObjects) throw new Error('Invalid object count');
 for(const list of objects.values()) {
  const gallery=list.filter(r=>r.role==='gallery'), queries=list.filter(r=>r.role==='query');
  if(list.length!==4||gallery.length!==1||queries.length!==3) throw new Error('Invalid split');
  if(new Set(list.map(r=>r.session_id)).size!==4||queries.some(r=>r.session_id===gallery[0].session_id)) throw new Error('Cross-session leakage');
 }
 return {images:rows.length,objects:objects.size,gallery:expectedObjects,queries:expectedObjects*3,duplicateFiles:0,duplicatePixels:0,sessions:[...new Set(rows.map(r=>r.session_id))].sort((a,b)=>a-b)};
}
export function thresholdMetrics(pairs,threshold) {
 if(!Number.isFinite(threshold)) throw new Error('Invalid threshold');
 let tp=0,fp=0,tn=0,fn=0;
 for(const p of pairs) { if(p.similarity>=threshold) { if(p.correct) tp++; else fp++; } else if(p.correct) fn++; else tn++; }
 return {threshold,tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,falsePositiveRate:fp+tn?fp/(fp+tn):null};
}
