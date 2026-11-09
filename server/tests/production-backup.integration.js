import {assertIsolatedInstance} from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {connect} from '../../database/scripts/connection.js';
import {configFromEnv} from '../../database/scripts/config.js';
import {verifyMigrations} from '../../database/scripts/migrate.js';
import {captureLogicalBackup,encryptLogicalBackup,decryptLogicalBackup,restoreLogicalBackup} from '../../database/scripts/production-demo-backup.js';

test('encrypted backup restores all synthetic schema/data onto a second isolated MySQL server and rejects tampering', {timeout:180000},async()=>{
  if(process.env.FINDIT_BACKUP_TEST_FILE){
    const bytes=await readFile(process.env.FINDIT_BACKUP_TEST_FILE);
    const archive=decryptLogicalBackup(bytes,process.env.FINDIT_BACKUP_TEST_PRIVATE_KEY);
    const database=`findit_test_${randomBytes(12).toString('hex')}`;
    const c=await connect({...configFromEnv(),dateStrings:true},false);
    let created=false;
    try{
      const [[target]]=await c.query('SELECT @@server_uuid AS id');
      assert.notEqual(target.id,archive.source.serverUuid);
      await c.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);created=true;
      await c.query(`USE \`${database}\``);
      await assert.rejects(restoreLogicalBackup(c,archive),/approval/);
      await restoreLogicalBackup(c,archive,{approved:true,expectedTargetUuid:target.id});
      await verifyMigrations(c,database);
      const restored=await captureLogicalBackup(c);
      assert.deepEqual(restored.tables.map(t=>({name:t.name,columns:t.columns,rows:t.rows})),archive.tables.map(t=>({name:t.name,columns:t.columns,rows:t.rows})));
    }finally{
      await c.query('SET SESSION TRANSACTION READ WRITE');
      if(created)await c.query(`DROP DATABASE \`${database}\``);
      await c.end();
    }
    return;
  }
  const c=await connect({...configFromEnv(),dateStrings:true});
  let archive;
  try{
    archive=await captureLogicalBackup(c);
    await assert.rejects(restoreLogicalBackup(c,archive,{approved:true,expectedTargetUuid:archive.source.serverUuid}),/source\/unapproved/);
  }finally{await c.end();}
  const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const encrypted=encryptLogicalBackup(archive,keys.publicKey);
  assert.deepEqual(decryptLogicalBackup(encrypted.bytes,keys.privateKey),archive);
  const bad=JSON.parse(encrypted.bytes.toString());bad.ciphertext=(bad.ciphertext.startsWith('A')?'B':'A')+bad.ciphertext.slice(1);
  assert.throws(()=>decryptLogicalBackup(Buffer.from(JSON.stringify(bad)),keys.privateKey));
  const dir=await mkdtemp(join(tmpdir(),'findit-backup-test-'));
  try{
    const path=join(dir,'snapshot.enc');await writeFile(path,encrypted.bytes,{mode:0o600});
    const childEnv={...process.env,FINDIT_BACKUP_TEST_FILE:path,FINDIT_BACKUP_TEST_PRIVATE_KEY:keys.privateKey};
    delete childEnv.NODE_TEST_CONTEXT;
    const child=spawn(process.execPath,[fileURLToPath(new URL('../../database/scripts/test-isolated.js',import.meta.url)),'--all','--suite=production-backup.integration.js'],{windowsHide:true,stdio:'inherit',env:childEnv});
    const code=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);});assert.equal(code,0);
  }finally{
    const rel=relative(resolve(tmpdir()),resolve(dir));
    if(!rel.startsWith('findit-backup-test-')||rel.includes(sep)||rel.startsWith('..'))throw new Error('Unowned backup test directory');
    await rm(dir,{recursive:true,force:true});
  }
});
