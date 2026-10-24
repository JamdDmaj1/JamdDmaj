// Read-only restart comparison. Prints checksums/counts, never account rows,
// addresses, policy values, signatures, credentials or custody key material.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [controlsDirectory,runtimeDirectory]=process.argv.slice(2);
if(process.argv.length!==4||controlsDirectory!=='/var/lib/private/jamddmaj-perps-controls'||runtimeDirectory!=='/var/lib/private/jamddmaj-perps-runtime')throw Error('INVALID_INSPECTION_SCOPE');
const files={controls:controlsDirectory+'/controls.sqlite',risk:runtimeDirectory+'/journal.sqlite',web:runtimeDirectory+'/web-submissions.sqlite',policy:runtimeDirectory+'/manual-policy.sqlite'};
const result={};for(const [kind,path] of Object.entries(files)){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0)throw Error('PRIVATE_STORE_REQUIRED');
 const db=new DatabaseSync(path,{readOnly:true,allowExtension:false});try{
  db.exec('PRAGMA trusted_schema=OFF');if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('STORE_INTEGRITY_FAILED');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  if(tables.some(name=>!/^((web_)?perps_|perps_manual_)[a-z_]+$/.test(name)))throw Error('UNKNOWN_TABLE');
  const permanent=tables.filter(name=>!name.includes('quota'));
  const rows=permanent.map(name=>({name,rows:db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()}));
  result[kind]={integrity:true,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),counts:Object.fromEntries(rows.map(value=>[value.name,value.rows.length]))};
  if(kind==='controls')result[kind].active=db.prepare('SELECT COUNT(*) AS count FROM perps_automation_controls WHERE enabled<>0 OR paused<>1').get().count;
 }finally{db.close();}
}
console.log(JSON.stringify(result));
