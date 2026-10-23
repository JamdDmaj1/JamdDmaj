// Operator-only additive checkpoint. Services must be drained and stopped.
// Includes permanent manual records AND the matching shared risk/controls.
// No custody keys, signing or transaction transport are loaded.
import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,readFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Encrypter,Decrypter} from 'age-encryption';
import {checkPrivateRecoveryPath as check,readPrivateRecoveryFile as read,writePrivateRecoveryFile as write,makePrivateRecoveryDirectory as mkdir} from '../lib/perps-recovery-private-files.js';
const names=['controls.sqlite','journal.sqlite','web-submissions.sqlite','manual-policy.sqlite','web-reviews.sqlite'],hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function validate(path){const db=new DatabaseSync(path,{readOnly:true,allowExtension:false});try{
 if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)throw Error();
 return db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count;
}finally{db.close();}}
let plain;
try{
 const [action]=process.argv.slice(2);if(process.argv.length!==3||!['create','verify'].includes(action))throw Error();
 const output=process.env.JAMDDMAJ_WEB_CHECKPOINT_OUTPUT,parent=check(process.env.JAMDDMAJ_WEB_CHECKPOINT_PARENT,true).path;
 if(!output||join(parent,output)!==join(parent,output.replace(/[^a-zA-Z0-9-]/g,''))||!/^[a-zA-Z0-9-]+$/.test(output))throw Error();
 const destination=join(parent,output);if(existsSync(destination))throw Error();
 if(action==='create'){
  const runtime=check(process.env.JAMDDMAJ_PERPS_RUNTIME_DIRECTORY,true).path,controls=check(process.env.JAMDDMAJ_PERPS_CONTROLS_DIRECTORY,true).path;
  for(const [env,name] of [['JAMDDMAJ_WEB_LOCK_DIRECTORY','web-service.lock'],['JAMDDMAJ_WORKER_LOCK_DIRECTORY','worker.lock']]){
   const directory=check(process.env[env],true).path;if(existsSync(join(directory,name)))throw Error();
  }
  // Recipient is PUBLIC and operator-installed; the private identity stays on
  // the recovery PC and is never sent to this server.
  const publicBytes=readFileSync(process.env.JAMDDMAJ_WEB_CHECKPOINT_RECIPIENT);if(publicBytes.length>256)throw Error();
  const recipient=publicBytes.toString('utf8').trim();if(!/^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(recipient))throw Error();
  const encrypt=new Encrypter();encrypt.addRecipient(recipient);mkdir(destination);
  const records=[];
  for(const name of names){
   const source=check(join(name==='controls.sqlite'?controls:runtime,name),false).path,db=new DatabaseSync(source,{readOnly:true,allowExtension:false}),target=join(destination,name);
   try{await backup(db,target);}finally{db.close();}chmodSync(target,0o600);check(target,false);const tables=validate(target),bytes=read(target,16*1024*1024);
   records.push({name,sha256:hash(bytes),tables,data:bytes.toString('base64')});
  }
  plain=Buffer.from(JSON.stringify({format:'jamddmaj-manual-runtime-checkpoint/v1',requiresPausedReconciliation:true,createdAt:Date.now(),records}));
  if(plain.length>64*1024*1024)throw Error();const ciphertext=await encrypt.encrypt(plain);write(join(destination,'manual-runtime.age'),ciphertext);
  // Private plaintext snapshots remain on the VPS for operator rollback only.
  console.log(JSON.stringify({stage:'ENCRYPTED_MANUAL_RUNTIME_CHECKPOINT',sha256:hash(ciphertext),databases:records.length,readyForSigning:false}));
 }else{
  const ciphertext=read(process.env.JAMDDMAJ_WEB_CHECKPOINT_ARCHIVE,65*1024*1024),decrypt=new Decrypter();decrypt.addIdentity(read(process.env.JAMDDMAJ_WEB_CHECKPOINT_IDENTITY,1024).toString('utf8').trim());
  plain=await decrypt.decrypt(ciphertext);if(plain.length>64*1024*1024)throw Error();const payload=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));
  if(payload?.format!=='jamddmaj-manual-runtime-checkpoint/v1'||payload.requiresPausedReconciliation!==true||!Array.isArray(payload.records)||payload.records.length!==names.length)throw Error();
  mkdir(destination);write(join(destination,'RESTORE_QUARANTINED'),'Offline proof only. Never automatically activate or replace production stores.');
  for(let index=0;index<names.length;index++){
   const record=payload.records[index],bytes=Buffer.from(record.data,'base64');if(record.name!==names[index]||bytes.length>16*1024*1024||bytes.toString('base64')!==record.data||hash(bytes)!==record.sha256)throw Error();
   const target=join(destination,record.name);write(target,bytes);if(validate(target)!==record.tables)throw Error();
  }
  console.log(JSON.stringify({stage:'OFFLINE_CHECKPOINT_RESTORE_VERIFIED',sha256:hash(ciphertext),databases:names.length,readyForSigning:false}));
 }
}catch{console.error('MANUAL_RUNTIME_CHECKPOINT_REFUSED');process.exitCode=1;}finally{plain?.fill(0);}
