// Invoked only inside the explicitly approved, read-only private sandbox.
import mysql from 'mysql2/promise';
import {verifyMigrations} from './migrate.js';
import {captureLogicalBackup,encryptLogicalBackup} from './production-demo-backup.js';
import {writeFile} from 'node:fs/promises';
async function main(){
  const env=process.env;
  if(env.FINDIT_DEMO_OPS_SCOPE!=='read-only' || env.FINDIT_DEMO_PROJECT_ID!=='66fa13b8-9b28-4ccc-a9bd-0b3f6c187a21' ||
    env.FINDIT_DEMO_ENVIRONMENT_ID!=='c9320496-f1b1-4730-b22b-777d7125b06d' || env.DB_HOST!=='mysql.railway.internal' || env.DB_NAME!=='findit_db' || env.DB_PORT!=='3306')throw new Error('Backup target rejected');
  const publicKey=Buffer.from(process.argv[2]||'','base64').toString();
  if(!publicKey.startsWith('-----BEGIN PUBLIC KEY-----'))throw new Error('Backup encryption public key required');
  const c=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,connectTimeout:10000});
  try{
    await c.query('SET SESSION TRANSACTION READ ONLY');
    const [[identity]]=await c.query('SELECT @@server_uuid AS id');
    if(identity.id!=='77676fb2-d8c9-11f1-9f0a-a2aad3869ed2')throw new Error('Backup server UUID changed');
    await verifyMigrations(c,env.DB_NAME);
    const archive=await captureLogicalBackup(c);
    const encrypted=encryptLogicalBackup(archive,publicKey);
    const ciphertextPath='/tmp/findit-demo-backup-cipher.enc';
    await writeFile(ciphertextPath,encrypted.bytes,{mode:0o600});
    console.log(JSON.stringify({ciphertextPath,encryptedBytes:encrypted.bytes.length,sha256:encrypted.sha256,tables:encrypted.tables,source:encrypted.source}));
  }finally{await c.end();}
}
main().catch(error=>{console.error(JSON.stringify({error:error.code||error.name,message:error.code?'Backup failed; credentials omitted':error.message}));process.exitCode=1;});
