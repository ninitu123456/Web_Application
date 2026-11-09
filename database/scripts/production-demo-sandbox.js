// One-off operator process only. Never imported by the HTTP application.
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {databaseOperation} from './production-demo-cli.js';
import {verifyMigrations} from './migrate.js';
import {inspect,plan,seed,rollback} from '../seeds/production-demo.js';
import {captureBaseline} from './production-demo-baseline.js';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
  const env=process.env,mode=process.argv[2]||'plan';
  if(env.FINDIT_DEMO_PROJECT_ID!=='66fa13b8-9b28-4ccc-a9bd-0b3f6c187a21' || env.FINDIT_DEMO_ENVIRONMENT_ID!=='c9320496-f1b1-4730-b22b-777d7125b06d' ||
    env.DB_HOST!=='mysql.railway.internal' || env.DB_PORT!=='3306' || env.DB_NAME!=='findit_db' || !env.DB_USER || !env.DB_PASSWORD || env.NODE_ENV!=='production')throw new Error('Operator target/configuration mismatch');
  if(!['inspect','plan','baseline','apply'].includes(mode))throw new Error('Unknown sandbox operation');
  const writing=mode==='apply';
  if(env.FINDIT_DEMO_OPS_SCOPE!==(writing?'seed-approved':'read-only'))throw new Error('Explicit sandbox operation scope required');
  for(const flag of ['AI_VISUAL_MATCHING_ENABLED','AI_VISUAL_SUGGESTIONS_ENABLED','AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED','AI_VISUAL_NOTIFICATION_SHADOW_MODE','AI_VISUAL_NOTIFICATION_DEMO_ENABLED']){
    if(env[flag] && env[flag]!=='false')throw new Error('AI must remain disabled');
  }
  let assets;
  try{assets=JSON.parse(await readFile(new URL('../demo-assets/cloudinary-manifest.json',import.meta.url),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const input={anchor:env.FINDIT_DEMO_ANCHOR_DATE,assets};
  if(!input.anchor)throw new Error('Explicit anchor date is required');
  if(writing){
    input.approval=JSON.parse(await readFile(new URL('../../.cache/production-demo-approval.json',import.meta.url),'utf8'));
    const previous=JSON.parse(await readFile(new URL('../../.cache/demo-production-baseline.json',import.meta.url),'utf8'));
    const c=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
    try{
      await c.query('SET SESSION TRANSACTION READ ONLY');await c.beginTransaction();
      const current=await captureBaseline(c,previous);await c.rollback();
      for(const before of previous.tables){
        const after=current.tables.find(t=>t.name===before.name);
        if(!after || before.sha256!==after.sha256 || before.totalCount!==after.totalCount)throw new Error(`Existing data changed in ${before.name}; replan before seed`);
      }
    }finally{await c.end();}
  }
  if(mode==='baseline'){
    const c=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
    try{
      await c.query("SET SESSION time_zone='+00:00'");await c.query('SET SESSION TRANSACTION READ ONLY');await c.beginTransaction();
      const result=await captureBaseline(c);await c.rollback();console.log(JSON.stringify(result));return;
    }finally{await c.end();}
  }
  const result=await databaseOperation(mode,input,{host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME},{mysql,bcrypt,randomBytes,digest,inspect,plan,seed,rollback,verifyMigrations});
  // Only metadata, counters and hashes leave this process. Never print env,
  // connection configuration, private user records or raw driver errors.
  console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(JSON.stringify({error:error.code||error.name||'OPERATOR_FAILED',message:error.code?'Database operation failed; credentials omitted':error.message}));process.exitCode=1;});
