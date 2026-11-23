import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const ROOT = fileURLToPath(new URL('./', import.meta.url));
export const RESULTS = resolve(ROOT, 'results');
export const DATA = resolve(ROOT, 'data');
export const CACHE = resolve(ROOT, 'cache');
export const SEED = 20261123;
export const DATASET = 'nhuy165/core50-sessions';
export const DATASET_REVISION = 'b4aa74e696e8900fd3c4200a840debc1b008a628';
export const CATEGORIES = ['plug adapters','mobile phones','scissors','light bulbs','cans','glasses','balls','markers','cups','remote controls'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function saveJson(path, data) { await writeFile(path, JSON.stringify(data,null,2)+'\n'); }
export async function setup() { for(const path of [RESULTS,DATA,CACHE]) await mkdir(path,{recursive:true}); }
export function csv(rows, fields = Object.keys(rows[0] ?? {})) {
 const cell = value => { const s = String(value ?? ''); return /[",\r\n]/.test(s) ? '"'+s.replaceAll('"','""')+'"' : s; };
 return [fields.join(','), ...rows.map(row=>fields.map(k=>cell(row[k])).join(','))].join('\n')+'\n';
}
export function stats(values) {
 if(!values.length) return {count:0,mean:null,p50:null,p95:null,min:null,max:null};
 const s=[...values].sort((a,b)=>a-b);
 return {count:s.length,mean:values.reduce((a,b)=>a+b,0)/s.length,p50:s[Math.ceil(.5*s.length)-1],p95:s[Math.ceil(.95*s.length)-1],min:s[0],max:s.at(-1)};
}
