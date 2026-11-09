import {createHash,randomBytes,createCipheriv,createDecipheriv,publicEncrypt,privateDecrypt,constants} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const q=name=>/^[a-z_]+$/i.test(name)?`\`${name}\``:(()=>{throw new Error('Unsafe backup identifier');})();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Capture application data in one read-only consistent InnoDB snapshot. Data
// never leaves process memory in plaintext. Unsupported DB objects fail closed.
export async function captureLogicalBackup(c){
  const run=async(sql,values=[]) => (await c.query({sql,timeout:10000},values))[0];
  await run("SET SESSION time_zone='+00:00'");
  await run('SET SESSION TRANSACTION READ ONLY');
  await run('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await run('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try{
    const [source]=await run('SELECT DATABASE() AS databaseName,@@server_uuid AS serverUuid,@@version AS mysqlVersion,UTC_TIMESTAMP(6) AS capturedAt,@@session.transaction_read_only AS readOnly');
    if(Number(source.readOnly)!==1)throw new Error('Backup connection must be read-only');
    const [schema]=await run('SELECT DEFAULT_CHARACTER_SET_NAME AS charset,DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE()');
    for(const [table,column] of [['ROUTINES','ROUTINE_SCHEMA'],['TRIGGERS','TRIGGER_SCHEMA'],['EVENTS','EVENT_SCHEMA']]){
      const [count]=await run(`SELECT COUNT(*) AS n FROM information_schema.${table} WHERE ${column}=DATABASE()`);
      if(Number(count.n)!==0)throw new Error('Backup routines/triggers/events require an extended export');
    }
    const inventory=await run('SELECT TABLE_NAME AS name,TABLE_TYPE AS kind,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
    if(inventory.some(t=>t.kind!=='BASE TABLE'||t.engine!=='InnoDB'))throw new Error('Only InnoDB base tables are supported');
    const tables=[];
    for(const {name} of inventory){
      const [ddl]=await run(`SHOW CREATE TABLE ${q(name)}`);
      const columns=await run('SELECT COLUMN_NAME AS name,DATA_TYPE AS dataType,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[name]);
      const [count]=await run(`SELECT COUNT(*) AS n FROM ${q(name)}`);
      if(Number(count.n)>100000)throw new Error('Logical backup row budget exceeded');
      const rows=await run(`SELECT * FROM ${q(name)}`);
      if(rows.length!==Number(count.n))throw new Error('Snapshot count mismatch');
      const values=rows.map(row=>columns.map(column=>{
        const value=row[column.name];
        return Buffer.isBuffer(value)?{kind:'buffer',value:value.toString('base64')}:{kind:'value',value};
      }));
      tables.push({name,createSql:ddl['Create Table'],columns,rows:values});
    }
    // Detect concurrent DDL rather than silently producing a partial backup.
    for(const table of tables){
      const [ddl]=await run(`SHOW CREATE TABLE ${q(table.name)}`);
      if(ddl['Create Table']!==table.createSql)throw new Error('DDL changed during backup');
    }
    await c.rollback();
    const archive={format:'findit-logical-backup/v1',source,schema,tables};
    if(Buffer.byteLength(JSON.stringify(archive))>32*1024*1024)throw new Error('Logical backup byte budget exceeded');
    return archive;
  }catch(error){await c.rollback();throw error;}
}

export function encryptLogicalBackup(archive,publicKey){
  const compressed=gzipSync(Buffer.from(JSON.stringify(archive)));
  const key=randomBytes(32),iv=randomBytes(12);
  const header={format:'findit-encrypted-backup/v1',sourceUuid:archive.source.serverUuid,databaseName:archive.source.databaseName,capturedAt:archive.source.capturedAt,compressedSha256:sha(compressed)};
  const aad=Buffer.from(JSON.stringify(header));
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(compressed),cipher.final()]);
  const encryptedKey=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
  key.fill(0);compressed.fill(0);
  const bytes=Buffer.from(JSON.stringify({header,iv:iv.toString('base64'),encryptedKey:encryptedKey.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}));
  return {bytes,sha256:sha(bytes),tables:archive.tables.map(t=>({name:t.name,rows:t.rows.length})),source:archive.source};
}

export function decryptLogicalBackup(bytes,privateKey){
  const envelope=JSON.parse(bytes.toString());
  if(envelope.header?.format!=='findit-encrypted-backup/v1')throw new Error('Unknown encrypted backup format');
  const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.encryptedKey,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(JSON.stringify(envelope.header)));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const compressed=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);key.fill(0);
  if(sha(compressed)!==envelope.header.compressedSha256)throw new Error('Backup integrity mismatch');
  const plaintext=gunzipSync(compressed,{maxOutputLength:32*1024*1024});compressed.fill(0);
  const archive=JSON.parse(plaintext.toString());plaintext.fill(0);
  if(archive.format!=='findit-logical-backup/v1' || archive.source.serverUuid!==envelope.header.sourceUuid || archive.source.databaseName!==envelope.header.databaseName)throw new Error('Backup source identity mismatch');
  return archive;
}

// Restore is a separate operation, never invoked by backup or seed. Caller must
// provide an empty recovery DB on a DIFFERENT MySQL instance, after approval.
export async function restoreLogicalBackup(c,archive,{expectedTargetUuid,approved=false}={}){
  if(!approved || !expectedTargetUuid)throw new Error('Explicit recovery target approval required');
  const run=async(sql,values=[]) => (await c.query({sql,timeout:10000},values))[0];
  const [target]=await run('SELECT @@server_uuid AS serverUuid,DATABASE() AS databaseName');
  if(target.serverUuid!==expectedTargetUuid || target.serverUuid===archive.source.serverUuid)throw new Error('Refusing restore onto source/unapproved server');
  if(!/^findit_test_[a-f0-9]{24}$/.test(target.databaseName) && target.databaseName!=='findit_db')throw new Error('Recovery database name rejected');
  const [count]=await run('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  if(Number(count.n)!==0)throw new Error('Recovery database must be empty');
  await run("SET SESSION time_zone='+00:00'");
  await run('SET SESSION FOREIGN_KEY_CHECKS=0');
  try{
    for(const table of archive.tables){
      q(table.name);
      if(!table.createSql.startsWith(`CREATE TABLE ${q(table.name)} (`))throw new Error('Backup DDL identity mismatch');
      await run(table.createSql);
    }
    await c.beginTransaction();
    try{
      for(const table of archive.tables){
        const writable=table.columns.map((col,index)=>({col,index})).filter(({col})=>!/VIRTUAL GENERATED|STORED GENERATED/.test(col.extra));
        for(const row of table.rows){
          const values=writable.map(({col,index})=>{
            const cell=row[index];
            if(cell.kind==='buffer')return Buffer.from(cell.value,'base64');
            return col.dataType==='json' && cell.value!==null?JSON.stringify(cell.value):cell.value;
          });
          await run(`INSERT INTO ${q(table.name)} (${writable.map(({col})=>q(col.name)).join(',')}) VALUES (${values.map(()=>'?').join(',')})`,values);
        }
      }
      // FK_CHECKS=1 doesn't retroactively validate rows; audit every FK first.
      const refs=await run('SELECT TABLE_NAME AS t,COLUMN_NAME AS c,REFERENCED_TABLE_NAME AS rt,REFERENCED_COLUMN_NAME AS rc FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_SCHEMA=DATABASE()');
      for(const ref of refs){
        const [row]=await run(`SELECT COUNT(*) AS n FROM ${q(ref.t)} a LEFT JOIN ${q(ref.rt)} b ON a.${q(ref.c)}=b.${q(ref.rc)} WHERE a.${q(ref.c)} IS NOT NULL AND b.${q(ref.rc)} IS NULL`);
        if(Number(row.n))throw new Error('Restored FK integrity failure');
      }
      await c.commit();
    }catch(error){await c.rollback();throw error;}
  }finally{await run('SET SESSION FOREIGN_KEY_CHECKS=1');}
  return {restoredTables:archive.tables.length,sourceUuid:archive.source.serverUuid,targetUuid:target.serverUuid};
}
