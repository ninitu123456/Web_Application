import {createHash} from 'node:crypto';
const identifier=name=>/^[a-z_]+$/i.test(name)?`\`${name}\``:(()=>{throw new Error('Unsafe schema identifier');})();
// Hashes, counts and PK cutoffs only. No user rows, tokens or password hashes
// are written to disk or printed. A later capture can hash the same old rows.
export async function captureBaseline(c,previous){
  const run=async(sql,values=[]) => (await c.query({sql,timeout:10000},values))[0];
  const [identity]=await run('SELECT DATABASE() AS db,@@server_uuid AS serverUuid,UTC_TIMESTAMP(6) AS capturedAt');
  if(previous && (previous.identity.db!==identity.db || previous.identity.serverUuid!==identity.serverUuid))throw new Error('Baseline database identity changed');
  const tables=await run("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const output=[];
  for(const {name} of tables){
    const keys=await run("SELECT COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION",[name]);
    if(keys.length!==1)throw new Error('Baseline requires one primary key per table');
    const pk=keys[0].name;
    const [count]=await run(`SELECT COUNT(*) AS n FROM ${identifier(name)}`);
    if(Number(count.n)>100000)throw new Error('Baseline row budget exceeded');
    const before=previous?.tables.find(t=>t.name===name);
    if(previous && !before)throw new Error('Baseline table set changed');
    const condition=before ? before.cutoffMode==='all'?'':before.maxPrimaryKey===null?' WHERE 1=0':` WHERE ${identifier(pk)} <= ?` : '';
    const values=before?.maxPrimaryKey!=null?[before.maxPrimaryKey]:[];
    const rows=await run(`SELECT * FROM ${identifier(name)}${condition} ORDER BY ${identifier(pk)}`,values);
    const hash=createHash('sha256');
    for(const row of rows)hash.update(JSON.stringify(row)+'\n');
    const last=rows.length?String(rows.at(-1)[pk]):null;
    const numeric=last!==null && /^\d+$/.test(last);
    // Non-numeric PKs can contain security-sensitive hashes. Keep those inside
    // the process; use a full-table comparison rather than exporting a cutoff.
    output.push({name,primaryKey:pk,totalCount:String(count.n),retainedCount:rows.length,cutoffMode:before?.cutoffMode||(last===null?'empty':numeric?'numeric':'all'),maxPrimaryKey:before?before.maxPrimaryKey:numeric?last:null,sha256:hash.digest('hex')});
  }
  if(previous && output.length!==previous.tables.length)throw new Error('Baseline table count changed');
  return {identity,tables:output};
}
