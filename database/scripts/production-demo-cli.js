import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { configFromEnv } from './config.js';
import { verifyMigrations } from './migrate.js';
import { createImageStorage } from '../../server/config/cloudinary.js';
import { fixtures, imageSubjects, marker } from '../seeds/production-demo-data.js';
import { assetId, inspect, plan, seed, rollback } from '../seeds/production-demo.js';

const assetsPath = new URL('../demo-assets/cloudinary-manifest.json',import.meta.url);
const approvalPath = new URL('../../.cache/production-demo-approval.json',import.meta.url);
const mode=process.argv[2]||'plan';
const loadJson=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This function also runs in memory over SSH. It opens no listener, starts no
// app worker and does not install files or dependencies on the API container.
export async function databaseOperation(mode, input, dbConfig, api) {
  const { mysql, inspect, plan, seed, rollback, verifyMigrations, digest, randomBytes, bcrypt }=api;
  const c=await mysql.createConnection({...dbConfig,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  try {
    await c.query("SET SESSION time_zone='+00:00'");
    await c.query('SET SESSION innodb_lock_wait_timeout=3');
    await c.query("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    if(['inspect','plan'].includes(mode))await c.query('SET SESSION TRANSACTION READ ONLY');
    await verifyMigrations(c,dbConfig.database);
    if(['inspect','plan'].includes(mode)) {
      await c.query('SET TRANSACTION READ ONLY');
      await c.beginTransaction();
      try {
        const p=await plan(c,input.anchor,input.assets);
        const {identity,counts,ledger,categories,locations,grants}=p.info;
        return {mode,identity,counts,ledgerHash:digest(ledger),ledgerCount:ledger.length,categories,locations,grants,summary:p.summary,
          approval:{anchor:input.anchor,serverUuid:identity.serverUuid,database:identity.db,ledgerHash:digest(ledger),assetsHash:digest(input.assets||null)}};
      } finally { await c.rollback(); }
    }
    if(!['apply','rollback'].includes(mode))throw new Error('Unknown database operation');
    const proof=input.approval;
    if(!proof || proof.confirmation!==`APPROVED:${mode}:${input.anchor}` || !proof.recoveryReference)throw new Error('Explicit confirmation and recovery reference required');
    const identity=(await inspect(c));
    if(identity.identity.serverUuid!==proof.serverUuid || identity.identity.db!==proof.database || digest(identity.ledger)!==proof.ledgerHash ||
      digest(input.assets)!==proof.assetsHash || input.anchor!==proof.anchor)throw new Error('Approved target/ledger/assets/date changed; run plan again');
    if(mode==='rollback')return await rollback(c,input);
    const hashes=await Promise.all([0,1].map(()=>bcrypt.hash(randomBytes(48).toString('base64'),12)));
    return await seed(c,{...input,hashes});
  } finally { await c.end(); }
}

async function upload() {
  if(process.env.FINDIT_DEMO_UPLOAD_APPROVED!==marker)throw new Error('Cloudinary upload requires explicit approval');
  const storage=createImageStorage();
  if(!storage)throw new Error('Cloudinary is not configured');
  let manifest={};
  try { manifest=await loadJson(assetsPath); } catch(error) { if(error.code!=='ENOENT')throw error; }
  for(const key of Object.keys(imageSubjects)) {
    const bytes=await readFile(new URL(`../demo-assets/${key}.png`,import.meta.url));
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(manifest[key] && (manifest[key].sha256!==sha256 || manifest[key].publicId!==assetId(key)))throw new Error('Existing asset manifest conflicts');
    if(!manifest[key]) {
      // An upload that lost its journal must be reviewed, never overwritten.
      const {v2:cloudinary}=await import('cloudinary');
      let existing;
      try { existing=await cloudinary.api.resource(assetId(key)); }
      catch(error) { if((error.http_code??error.error?.http_code)!==404)throw error; }
      if(existing)throw new Error(`Unjournaled Cloudinary asset ${key}; verify ownership before resuming`);
      const asset=await storage.upload(bytes,'image/png',assetId(key));
      manifest[key]={...asset,sha256};
      await writeFile(assetsPath,JSON.stringify(manifest,null,2)+'\n');
    }
    const response=await fetch(manifest[key].url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok || !response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Public image unavailable: ${key}`);
    const body=Buffer.from(await response.arrayBuffer());
    // Cloudinary may rewrite PNG metadata; source and delivery hashes are
    // recorded separately. A later change to the public resource is rejected.
    if(body.length<24 || body.subarray(1,4).toString()!=='PNG' || body.readUInt32BE(16)<1000 || body.readUInt32BE(20)<1000)throw new Error(`Invalid public PNG: ${key}`);
    const deliverySha256=createHash('sha256').update(body).digest('hex');
    if(manifest[key].deliverySha256 && manifest[key].deliverySha256!==deliverySha256)throw new Error(`Public image changed: ${key}`);
    manifest[key].deliverySha256=deliverySha256;
    await writeFile(assetsPath,JSON.stringify(manifest,null,2)+'\n');
  }
  return {assets:Object.keys(manifest).length,itemImages:fixtures.length,manifestHash:digest(manifest)};
}

async function cloudinaryCheck() {
  const storage=createImageStorage();
  if(!storage)throw new Error('Cloudinary is not configured');
  const {v2:cloudinary}=await import('cloudinary');
  let ping;
  try {ping=await cloudinary.api.ping({timeout:15000});}
  catch(error){return {mode:'cloudinary-check',authenticated:false,cloudName:process.env.CLOUDINARY_CLOUD_NAME,httpCode:error.http_code??error.error?.http_code,errorCode:error.code??error.error?.code??'CLOUDINARY_API_FAILED',credentialsConfigured:['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'].every(k=>Boolean(process.env[k]))};}
  const assets=[];
  for(const key of Object.keys(imageSubjects)) {
    const bytes=await readFile(new URL(`../demo-assets/${key}.png`,import.meta.url));
    if(bytes.length<24 || bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || bytes.length>5*1024*1024 || bytes.readUInt32BE(16)<1000 || bytes.readUInt32BE(20)<1000)throw new Error(`Invalid source PNG: ${key}`);
    let existing=false;
    try {await cloudinary.api.resource(assetId(key),{timeout:15000});existing=true;}
    catch(error){if((error.http_code??error.error?.http_code)!==404)throw error;}
    assets.push({key,publicId:assetId(key),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:createHash('sha256').update(bytes).digest('hex'),existing});
  }
  return {mode:'cloudinary-check',authenticated:ping.status==='ok',cloudName:process.env.CLOUDINARY_CLOUD_NAME,uploadPermission:'Not proven until an approved upload succeeds',assets,totalBytes:assets.reduce((sum,a)=>sum+a.bytes,0)};
}

async function main() {
  const anchor=process.env.FINDIT_DEMO_ANCHOR_DATE;
  if(mode==='cloudinary-check')return cloudinaryCheck();
  if(mode==='upload')return upload();
  if(!anchor)throw new Error('FINDIT_DEMO_ANCHOR_DATE is required; use the approved client calendar date');
  let assets;
  try { assets=await loadJson(assetsPath); }catch(error){if(error.code!=='ENOENT')throw error;}
  let approval;
  if(['apply','rollback'].includes(mode))approval=await loadJson(approvalPath);
  const input={anchor,assets,approval};
  if(process.argv.includes('--bundle')) {
    // Imports of application dependencies resolve in the deployed working
    // directory. Only the reviewed seed modules are embedded; no secret is.
    const data=await readFile(new URL('../seeds/production-demo-data.js',import.meta.url),'utf8');
    const dataUrl=`data:text/javascript;base64,${Buffer.from(data).toString('base64')}`;
    const core=(await readFile(new URL('../seeds/production-demo.js',import.meta.url),'utf8')).replace("'./production-demo-data.js'",JSON.stringify(dataUrl));
    const coreUrl=`data:text/javascript;base64,${Buffer.from(core).toString('base64')}`;
    const code=`(async()=>{const mysql=(await import('mysql2/promise')).default;const bcrypt=(await import('bcryptjs')).default;const {randomBytes,createHash}=await import('node:crypto');const digest=${digest.toString()};const {inspect,plan,seed,rollback}=await import(${JSON.stringify(coreUrl)});const {verifyMigrations}=await import('./database/scripts/migrate.js');const run=${databaseOperation.toString()};const env=process.env;if(env.RAILWAY_PROJECT_ID!=='66fa13b8-9b28-4ccc-a9bd-0b3f6c187a21'||env.RAILWAY_ENVIRONMENT_ID!=='c9320496-f1b1-4730-b22b-777d7125b06d'||env.RAILWAY_SERVICE_ID!=='5ce2c6ec-9081-4e98-86be-9d0b4406fea5')throw new Error('Railway target mismatch');for(const name of ['AI_VISUAL_MATCHING_ENABLED','AI_VISUAL_SUGGESTIONS_ENABLED','AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED','AI_VISUAL_NOTIFICATION_SHADOW_MODE','AI_VISUAL_NOTIFICATION_DEMO_ENABLED'])if(env[name]&&env[name]!=='false')throw new Error('Disable AI before demo operations');const result=await run(${JSON.stringify(mode)},${JSON.stringify(input)},{host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME},{mysql,bcrypt,randomBytes,digest,inspect,plan,seed,rollback,verifyMigrations});console.log(JSON.stringify(result));})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.code?'Database operation failed; credentials omitted':e.message}));process.exitCode=1;});`;
    const path=new URL('../../.cache/production-demo-command.b64',import.meta.url);
    await mkdir(new URL('../../.cache/',import.meta.url),{recursive:true});
    await writeFile(path,Buffer.from(code).toString('base64'));
    return {bundle:fileURLToPath(path),mode,readOnly:['inspect','plan'].includes(mode)};
  }
  // Local execution is restricted to the disposable test instance. Production
  // execution uses --bundle and the provider identity guard above.
  const {assertIsolatedInstance}=await import('./assert-isolated.js');
  await assertIsolatedInstance();
  return databaseOperation(mode,input,configFromEnv(),{mysql,bcrypt,randomBytes,digest,inspect,plan,seed,rollback,verifyMigrations});
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{
  const httpCode=e.http_code??e.error?.http_code;
  console.error(JSON.stringify({error:e.code||e.name||'OPERATION_FAILED',httpCode,message:e.code||httpCode?'Operation failed; credentials omitted':e.message||'Operation failed; credentials omitted'}));process.exitCode=1;
});
