// Private durable owner+wallet policy only. Never allocates bot capital,
// generates keys, signs, submits, or invents a default trading allowance.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {existsSync,lstatSync} from 'node:fs';
import bs58 from 'bs58';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write} from './perps-recovery-private-files.js';
import {validateManualPerpsLimits} from './perps-manual-limits.js';
const stores=new WeakSet();
const table=`CREATE TABLE perps_manual_policies (owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL UNIQUE,limits TEXT NOT NULL,updated INTEGER NOT NULL CHECK(updated>=0),PRIMARY KEY(owner,wallet)) STRICT`;
const audit=`CREATE TABLE perps_manual_policy_audit (sequence INTEGER PRIMARY KEY,owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,limits TEXT NOT NULL,updated INTEGER NOT NULL CHECK(updated>=0)) STRICT`;
const normal=s=>s.replace(/\s+/g,' ').trim();
function fail(code='MANUAL_PERPS_POLICY_UNAVAILABLE'){throw Error(code);}
function identity({ownerAccountHash,walletAddress}={}){
 if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
 try{if(typeof walletAddress!=='string'||walletAddress.length>44||bs58.decode(walletAddress).length!==32||bs58.encode(bs58.decode(walletAddress))!==walletAddress)fail();}catch{fail();}
 return {ownerAccountHash,walletAddress};
}
export function requireManualPerpsPolicyStore(store){if(!stores.has(store))fail();return store;}
export function openManualPerpsPolicyStore(filename,{initialize=false,allowNonPosixForTests=false,now=Date.now}={}){
 if(typeof initialize!=='boolean'||typeof now!=='function')fail();
 check(dirname(filename),true,allowNonPosixForTests);
 if(!existsSync(filename)){if(!initialize)fail();write(filename,Buffer.alloc(0),allowNonPosixForTests);}
 const before=check(filename,false,allowNonPosixForTests).stat;
 if(initialize&&before.size!==0)fail();
 const verifyDb=source=>{const rows=source.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();if(rows.length!==2||rows[0].name!=='perps_manual_policies'||normal(rows[0].sql)!==normal(table)||rows[1].name!=='perps_manual_policy_audit'||normal(rows[1].sql)!==normal(audit))fail();};
 if(!initialize){const source=new DatabaseSync(filename,{readOnly:true,allowExtension:false});try{verifyDb(source);if(source.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail();}finally{source.close();}}
 const db=new DatabaseSync(filename,{timeout:5000,allowExtension:false});let closed=false;
 const verify=()=>verifyDb(db);
 try{
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  if(initialize){db.exec('BEGIN IMMEDIATE;'+table+';'+audit+';COMMIT;');}verify();
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail();
 }catch(error){db.close();throw error;}
 function at(){
  const stat=check(filename,false,allowNonPosixForTests).stat,time=now();
  if(closed||stat.ino!==before.ino||stat.dev!==before.dev||!Number.isSafeInteger(time)||time<0)fail();verify();return time;
 }
 function read(who){at();const id=identity(who),row=db.prepare('SELECT * FROM perps_manual_policies WHERE owner=? AND wallet=?').get(id.ownerAccountHash,id.walletAddress);
  if(!row)return null;const limits=validateManualPerpsLimits(JSON.parse(row.limits));
  if(JSON.stringify(limits)!==row.limits||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.revision)||!Number.isSafeInteger(row.updated)||row.updated>now())fail();
  return Object.freeze({walletAddress:row.wallet,revision:row.revision,limits,updatedAt:row.updated});
 }
 const store=Object.freeze({read,
  listWallets({afterWallet='',limit=20}={}){
   at();if(typeof afterWallet!=='string'||afterWallet!==''&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(afterWallet)||!Number.isSafeInteger(limit)||limit<1||limit>50)fail();
   return db.prepare('SELECT DISTINCT wallet FROM perps_manual_policies WHERE wallet>? ORDER BY wallet LIMIT ?').all(afterWallet,limit).map(row=>row.wallet);
  },
  readLimits(who){const state=read(who);if(!state)fail('MANUAL_PERPS_LIMITS_REQUIRED');return Object.freeze({walletAddress:state.walletAddress,revision:state.revision,limits:state.limits});},
  save({ownerAccountHash,walletAddress,expectedRevision,limits,explicitApproval}={}){
   if(explicitApproval!==true)fail('MANUAL_PERPS_POLICY_APPROVAL_REQUIRED');
   const who=identity({ownerAccountHash,walletAddress}),canonical=validateManualPerpsLimits(limits),time=at();
   db.exec('BEGIN IMMEDIATE');try{
    const previous=read(who);if(expectedRevision!==(previous?.revision??null))fail('STALE_MANUAL_PERPS_POLICY');
    if(!previous&&(db.prepare('SELECT COUNT(*) AS count FROM perps_manual_policies WHERE owner=?').get(ownerAccountHash).count>=20
     ||db.prepare('SELECT COUNT(*) AS count FROM perps_manual_policies').get().count>=10000))fail('MANUAL_PERPS_POLICY_CAPACITY');
    const revision=randomUUID(),encoded=JSON.stringify(canonical);
    db.prepare('INSERT INTO perps_manual_policies (owner,wallet,revision,limits,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner,wallet) DO UPDATE SET revision=excluded.revision,limits=excluded.limits,updated=excluded.updated').run(ownerAccountHash,walletAddress,revision,encoded,time);
    db.prepare('INSERT INTO perps_manual_policy_audit (owner,wallet,revision,limits,updated) VALUES(?,?,?,?,?)').run(ownerAccountHash,walletAddress,revision,encoded,time);
    const result=read(who);db.exec('COMMIT');return result;
   }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
  },
  close(){if(!closed){closed=true;db.close();}}
 });stores.add(store);return store;
}
