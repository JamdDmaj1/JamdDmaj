// Read-only operator inventory. No custody keys, account identifiers or rows
// are printed. Existing SQLite files only; never creates/migrates a database.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync} from 'node:fs';
const paths=process.argv.slice(2);
if(paths.length!==3)throw Error('EXPECTED_CONTROLS_JOURNAL_BACKUP');
const result={};
for(const [i,kind] of ['controls','journal','backup'].entries()){
 const stat=lstatSync(paths[i]);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077))throw Error('PRIVATE_EXISTING_FILE_REQUIRED');
 const db=new DatabaseSync(paths[i],{readOnly:true,allowExtension:false});
 try{
  db.exec('PRAGMA trusted_schema=OFF;');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row,sql:row.sql?.replace(/\s+/g,' ').trim()}));
  const tables=schema.filter(r=>r.type==='table').map(r=>r.name);
  if(tables.some(name=>!/^perps_[a-z_]+$/.test(name)))throw Error('UNKNOWN_TABLE');
  const counts=Object.fromEntries(tables.map(name=>[name,db.prepare('SELECT COUNT(*) AS count FROM '+name).get().count]));
  result[kind]={schema:createHash('sha256').update(JSON.stringify(schema)).digest('hex'),integrity:db.prepare('PRAGMA integrity_check').all().every(r=>Object.values(r)[0]==='ok'),counts};
  if(kind==='controls')result[kind].active=db.prepare('SELECT COUNT(*) AS count FROM perps_automation_controls WHERE enabled<>0 OR paused<>1').get().count;
 }finally{db.close();}
}
console.log(JSON.stringify(result));
