// Pure read-only operator library: deliberately has NO executable entry point.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync} from 'node:fs';
const runtime='/var/lib/private/jamddmaj-perps-runtime',controls='/var/lib/private/jamddmaj-perps-controls';
const defaults={controls:controls+'/controls.sqlite',journal:runtime+'/journal.sqlite',policy:runtime+'/manual-policy.sqlite',swaps:runtime+'/swaps.sqlite',fees:runtime+'/fees.sqlite',payments:runtime+'/payments.sqlite',backup:runtime+'/backup.sqlite'};
const hash=v=>createHash('sha256').update(v).digest('hex'),encode=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?{$integer:String(x)}:x);
const fail=()=>{throw Error('FINANCIAL_STATE_UPDATE_REFUSED');};
export function reviewedDatabaseFingerprint(path,excluded=[]){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())fail();const db=new DatabaseSync(path,{readOnly:true});
 try{
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail();
  const schema=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const rows=schema.filter(v=>v.type==='table'&&!excluded.includes(v.name)).map(v=>{if(!/^[a-z_][a-z0-9_]*$/.test(v.name))fail();const s=db.prepare('SELECT * FROM "'+v.name+'"');s.setReadBigInts(true);return [v.name,s.all().map(encode).sort()];});return hash(encode([schema,rows]));
 }finally{db.close();}
}
export function readReviewedBinaryFinancialState({files=defaults}={}){
 const count=(name,sql)=>{const db=new DatabaseSync(files[name],{readOnly:true});try{return Number(db.prepare(sql).get().n);}finally{db.close();}};
 for(const [file,sql]of [
  ['controls','SELECT COUNT(*) n FROM perps_automation_controls WHERE enabled<>0 OR paused<>1'],
  ['journal',"SELECT COUNT(*) n FROM perps_reservations WHERE state NOT IN ('OPEN','CLOSED','CANCELLED')"],
  ['journal',"SELECT COUNT(*) n FROM perps_position_closes WHERE state='PREPARED'"],
  ['journal',"SELECT COUNT(*) n FROM perps_close_conversions WHERE state!='FINALIZED'"],
  ['journal',"SELECT COUNT(*) n FROM perps_exit_cancellations WHERE state IN ('PREPARED','SIGNING','UNCERTAIN')"],
  ['journal',"SELECT COUNT(*) n FROM perps_platform_fee_locks WHERE state='HELD'"],
  ['journal',"SELECT COUNT(*) n FROM perps_entry_conversion_holds h LEFT JOIN perps_reservations p ON p.reservation=h.reservation WHERE h.state='HELD' AND (p.reservation IS NULL OR p.state!='CANCELLED' OR h.signature IS NOT NULL OR h.wire_hash IS NOT NULL)"],
  ['swaps',"SELECT COUNT(*) n FROM bot_wallet_swaps WHERE state NOT IN ('ABORTED','FAILED','FINALIZED')"],
  ['payments',"SELECT COUNT(*) n FROM perps_platform_fee_payments WHERE state IN ('SIGNING','UNKNOWN')"]])if(count(file,sql)!==0)fail();
 const fees=new DatabaseSync(files.fees,{readOnly:true}),payments=new DatabaseSync(files.payments,{readOnly:true});
 try{for(const row of fees.prepare('SELECT id FROM perps_platform_fee_assessments').all())if(!payments.prepare("SELECT 1 FROM perps_platform_fee_payments WHERE assessment_id=? AND state='PAID'").get(row.id))fail();}finally{fees.close();payments.close();}
 const journal=new DatabaseSync(files.journal,{readOnly:true}),swaps=new DatabaseSync(files.swaps,{readOnly:true});
 try{for(const row of journal.prepare("SELECT h.conversion_id FROM perps_entry_conversion_holds h JOIN perps_reservations p ON p.reservation=h.reservation WHERE h.state='HELD' AND p.state='CANCELLED'").all()){
  const swap=swaps.prepare('SELECT state,signature,signed FROM bot_wallet_swaps WHERE id=?').get(row.conversion_id);if(!swap||swap.state!=='ABORTED'||swap.signature!==null||swap.signed!==null)fail();
 }}finally{journal.close();swaps.close();}
 const digests=Object.entries(files).map(([name,path])=>[name,reviewedDatabaseFingerprint(path,name==='controls'?['perps_control_request_quota']:[])]);
 return {digest:hash(encode(digests)),open:count('journal',"SELECT COUNT(*) n FROM perps_reservations WHERE state='OPEN'")};
}
