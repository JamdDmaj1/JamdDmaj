// Bounded unsigned-review cache on the VPS. Expiration removes only unsigned
// review packets, never the permanent submission or shared-risk ledgers.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write} from './perps-recovery-private-files.js';
const sql='CREATE TABLE perps_unsigned_reviews (id TEXT PRIMARY KEY,packet TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL) STRICT';
function fail(){throw Error('PERPS_REVIEW_DB_UNAVAILABLE');}
export function openWebPerpsReviewDb(filename,{initialize=false,allowNonPosixForTests=false,now=Date.now}={}){
 if(typeof initialize!=='boolean'||typeof now!=='function')fail();check(dirname(filename),true,allowNonPosixForTests);
 if(!existsSync(filename)){if(!initialize)fail();write(filename,Buffer.alloc(0),allowNonPosixForTests);}
 const original=check(filename,false,allowNonPosixForTests).stat;if(initialize&&original.size!==0)fail();
 const verify=db=>{const rows=db.prepare("SELECT type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();if(rows.length!==1||rows[0].type!=='table'||rows[0].sql!==sql)fail();};
 if(!initialize){const db=new DatabaseSync(filename,{readOnly:true,allowExtension:false});try{verify(db);}finally{db.close();}}
 const db=new DatabaseSync(filename,{timeout:5000,allowExtension:false});let closed=false;
 try{db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');if(initialize)db.exec(sql);verify(db);}catch(error){db.close();throw error;}
 return Object.freeze({close(){if(!closed){closed=true;db.close();}},async command(args){
  const stat=check(filename,false,allowNonPosixForTests).stat,at=now();
  if(closed||stat.ino!==original.ino||stat.dev!==original.dev||!Number.isSafeInteger(at)||at<0)fail();verify(db);
  if(!Array.isArray(args)||typeof args[1]!=='string'||!/^jamd:web-perps:review:v1:[a-f0-9]{64}$/.test(args[1]))fail();
  const id=args[1].slice(-64);
  if(args[0]==='GET'&&args.length===2){const row=db.prepare('SELECT * FROM perps_unsigned_reviews WHERE id=?').get(id);return row&&row.created<=at&&row.expires>at?row.packet:null;}
  if(args[0]!=='SET'||args.length!==6||typeof args[2]!=='string'||args[2].length>8192||args[3]!=='EX'||args[4]!==120||args[5]!=='NX')fail();
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('DELETE FROM perps_unsigned_reviews WHERE expires<=?').run(at);
   if(db.prepare('SELECT COUNT(*) AS count FROM perps_unsigned_reviews').get().count>=1000)fail();
   const result=db.prepare('INSERT INTO perps_unsigned_reviews (id,packet,created,expires) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,args[2],at,at+120000);
   db.exec('COMMIT');return result.changes===1?'OK':null;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 }});
}
