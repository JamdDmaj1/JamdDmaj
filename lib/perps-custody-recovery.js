// Operator-only custody recovery, never an HTTP/browser API or permission to
// trade. v2 includes consistent runtime snapshots, always restored paused.
import {Encrypter,Decrypter,generateX25519Identity,identityToRecipient} from 'age-encryption';
import {existsSync,readdirSync} from 'node:fs';
import {isAbsolute,resolve,dirname,join} from 'node:path';
import {createHash,createDecipheriv,createPrivateKey,createPublicKey,randomBytes} from 'node:crypto';
import bs58 from 'bs58';
import {openPerpsCustodyVault,PERPS_CUSTODY_RESTORE_REVIEW_MARKER} from './perps-custody-vault.js';
import {withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectPerpsRuntimeRecoveryDatabases} from './perps-runtime-recovery.js';
import {checkPrivateRecoveryPath as check,readPrivateRecoveryFile as privateRead,writePrivateRecoveryFile as privateWrite,makePrivateRecoveryDirectory as makePrivateDirectory} from './perps-recovery-private-files.js';
const FORMAT='jamddmaj-perps-custody-recovery/v1',RUNTIME_FORMAT='jamddmaj-perps-custody-recovery/v2',PROOF_FORMAT='jamddmaj-perps-custody-recovery/v3',PURPOSE='jamddmaj-perps-automation',MAX=24*1024*1024;
const challenges=new WeakMap();
const IDENTITY='operator-age-identity.txt',RECIPIENT='operator-age-recipient.txt';
const OWNER=/^[a-f0-9]{64}$/,PUBLIC=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function fail(){throw Error('PERPS_CUSTODY_RECOVERY_UNAVAILABLE');}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function time(now){const value=now();if(!Number.isSafeInteger(value)||value<0||!Number.isFinite(new Date(value).valueOf()))fail();return value;}
function canonicalPath(path){if(typeof path!=='string'||!isAbsolute(path))fail();return resolve(path);}
function bindings(identities){
 const owners=new Map();for(const value of identities){if(owners.has(value.ownerAccountHash)&&owners.get(value.ownerAccountHash)!==value.walletAddress)fail();owners.set(value.ownerAccountHash,value.walletAddress);}
 return [...owners.keys()].sort().map(ownerAccountHash=>({ownerAccountHash,walletAddress:owners.get(ownerAccountHash)}));
}
export function readPerpsCustodyRecoveryChallenge(archive){const value=challenges.get(archive);if(!value)fail();return structuredClone(value);}
function base64(value,length){if(typeof value!=='string')fail();const bytes=Buffer.from(value,'base64');if(bytes.length!==length||bytes.toString('base64')!==value)fail();return bytes;}
function parseRecord(name,data,key){
 if(typeof name!=='string'||data.length>4096||!(/^(owner-[a-f0-9]{64}|[1-9A-HJ-NP-Za-km-z]{32,44})\.json$/.test(name)))fail();
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{fail();}
 if(!value||Object.keys(value).sort().join(',')!=='ciphertext,iv,ownerAccountHash,purpose,tag,version,walletAddress'
  ||value.version!==1||value.purpose!==PURPOSE||!OWNER.test(value.ownerAccountHash)||!PUBLIC.test(value.walletAddress)
  ||bs58.decode(value.walletAddress).length!==32||![value.walletAddress+'.json','owner-'+value.ownerAccountHash+'.json'].includes(name))fail();
 const aad=Buffer.from(JSON.stringify({version:1,purpose:PURPOSE,ownerAccountHash:value.ownerAccountHash,walletAddress:value.walletAddress}));let seed,der;
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,base64(value.iv,12));decipher.setAAD(aad);decipher.setAuthTag(base64(value.tag,16));
  seed=Buffer.concat([decipher.update(base64(value.ciphertext,32)),decipher.final()]);if(seed.length!==32)fail();
  der=Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]);
  const signer=createPrivateKey({key:der,format:'der',type:'pkcs8'}),publicKey=createPublicKey(signer).export({format:'der',type:'spki'}).subarray(-32);
  if(bs58.encode(publicKey)!==value.walletAddress)fail();return Object.freeze({ownerAccountHash:value.ownerAccountHash,walletAddress:value.walletAddress});
 }finally{seed?.fill(0);der?.fill(0);}
}
export async function initializePerpsOperatorRecovery({directory,allowNonPosixForTests=false}={}){
 try{
  directory=canonicalPath(directory);let created=false;
  if(!existsSync(directory))makePrivateDirectory(directory,allowNonPosixForTests);else check(directory,true,allowNonPosixForTests);
  const identityFile=join(directory,IDENTITY),recipientFile=join(directory,RECIPIENT);let identity;
  if(existsSync(identityFile))identity=privateRead(identityFile,1024,allowNonPosixForTests).toString('utf8').trim();
  else{
   if(existsSync(recipientFile))fail();identity=await generateX25519Identity();privateWrite(identityFile,Buffer.from(identity+'\n'),allowNonPosixForTests);created=true;
  }
  const recipient=await identityToRecipient(identity);
  if(existsSync(recipientFile)){if(privateRead(recipientFile,256,allowNonPosixForTests).toString('utf8').trim()!==recipient)fail();}
  else privateWrite(recipientFile,Buffer.from(recipient+'\n'),allowNonPosixForTests);
  return Object.freeze({stage:'OPERATOR_RECOVERY_KEY_READY',created,recipient,identityFile,recipientFile});
 }catch{fail();}
}
export async function createPerpsCustodyRecoveryArchive(options={}){
 if(options?.explicitOperatorApproval!==true)fail();
 const {runtimePaths=null,...custody}=options;
 if(custody.requireRestoreProof!==undefined&&typeof custody.requireRestoreProof!=='boolean'||custody.requireRestoreProof===true&&runtimePaths===null)fail();
 if(runtimePaths===null)return createArchive(custody,null);
 if(!runtimePaths||Object.keys(runtimePaths).sort().join(',')!=='controlsPath,journalPath,temporaryDirectory')fail();
 return withLockedPerpsRuntimeRecoverySnapshot({...runtimePaths,allowNonPosixForTests:custody.allowNonPosixForTests},snapshot=>createArchive(custody,snapshot));
}
async function createArchive({directory,keyFile,recipient,explicitOperatorApproval,requireRestoreProof=false,now=Date.now,allowNonPosixForTests=false}={},snapshot){
 let key,plain,verificationBytes;
 try{
  if(explicitOperatorApproval!==true||typeof recipient!=='string'||!/^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(recipient))fail();
  const encrypter=new Encrypter();encrypter.addRecipient(recipient);
  const vault=openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests});check(directory,true,allowNonPosixForTests);check(dirname(keyFile),true,allowNonPosixForTests);
  key=privateRead(keyFile,32,allowNonPosixForTests);if(key.length!==32)fail();
  const names=readdirSync(directory).sort();if(!names.length||names.length>256)fail();const records=[],wallets=new Set(),identities=[];
  for(const name of names){
   const data=privateRead(join(directory,name),4096,allowNonPosixForTests),identity=parseRecord(name,data,key);
   if(vault.describe(identity).exclusive!==true)fail();wallets.add(identity.walletAddress);identities.push(identity);
   records.push({name,data:data.toString('base64'),sha256:digest(data)});
  }
  const again=privateRead(keyFile,32,allowNonPosixForTests);try{if(!again.equals(key))fail();}finally{again.fill(0);}
  const runtimeDatabases=snapshot===null?null:inspectPerpsRuntimeRecoveryDatabases(readPerpsRuntimeRecoverySnapshot(snapshot),{temporaryDirectory:dirname(keyFile),identities,allowNonPosixForTests});
  if(requireRestoreProof&&!runtimeDatabases)fail();const covered=requireRestoreProof?bindings(identities):null;
  if(requireRestoreProof)verificationBytes=randomBytes(32);
  const createdAt=time(now),payload={format:requireRestoreProof?PROOF_FORMAT:runtimeDatabases?RUNTIME_FORMAT:FORMAT,network:'solana-mainnet',scope:runtimeDatabases?'CUSTODY_AND_RUNTIME':'CUSTODY_KEYS_ONLY',requiresPausedReconciliation:true,createdAt,masterKey:key.toString('base64'),records,...(runtimeDatabases?{runtimeDatabases}:{}),...(requireRestoreProof?{verificationToken:verificationBytes.toString('hex')}:{})};
  plain=Buffer.from(JSON.stringify(payload));if(plain.length>MAX)fail();const ciphertext=await encrypter.encrypt(plain);
  const result=Object.freeze({stage:runtimeDatabases?'ENCRYPTED_CUSTODY_AND_RUNTIME':'ENCRYPTED_CUSTODY_KEYS_ONLY',ciphertext,sha256:digest(ciphertext),createdAt,walletCount:wallets.size,recipient,
   runtimeStateIncluded:runtimeDatabases!==null,backupVerified:false,readyForSigning:false});
  if(requireRestoreProof)challenges.set(result,{archiveSha256:result.sha256,createdAt,verificationTokenHash:digest(verificationBytes),bindings:covered});
  return result;
 }catch{fail();}finally{key?.fill(0);plain?.fill(0);verificationBytes?.fill(0);}
}
export async function restorePerpsCustodyRecoveryArchive({ciphertext,operatorDirectory,destinationDirectory,explicitOperatorApproval,now=Date.now,allowNonPosixForTests=false}={}){
 let plain,key;
 try{
  if(explicitOperatorApproval!==true||!(ciphertext instanceof Uint8Array)||ciphertext.length<100||ciphertext.length>MAX+65536)fail();
  destinationDirectory=canonicalPath(destinationDirectory);check(dirname(destinationDirectory),true,allowNonPosixForTests);if(existsSync(destinationDirectory))fail();
  check(operatorDirectory,true,allowNonPosixForTests);
  const identity=privateRead(join(operatorDirectory,IDENTITY),1024,allowNonPosixForTests).toString('utf8').trim(),decrypter=new Decrypter();decrypter.addIdentity(identity);
  plain=await decrypter.decrypt(ciphertext);if(plain.length>MAX)fail();const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
  const proofRequested=payload?.format===PROOF_FORMAT,runtime=proofRequested||payload?.format===RUNTIME_FORMAT;
  if(!payload||Object.keys(payload).sort().join(',')!==(runtime?'createdAt,format,masterKey,network,records,requiresPausedReconciliation,runtimeDatabases,scope'+(proofRequested?',verificationToken':''):'createdAt,format,masterKey,network,records,requiresPausedReconciliation,scope')
   ||!runtime&&payload.format!==FORMAT||payload.network!=='solana-mainnet'||payload.scope!==(runtime?'CUSTODY_AND_RUNTIME':'CUSTODY_KEYS_ONLY')||payload.requiresPausedReconciliation!==true
   ||!Number.isSafeInteger(payload.createdAt)||payload.createdAt<0||payload.createdAt>time(now)+300000||!Array.isArray(payload.records)||!payload.records.length||payload.records.length>256)fail();
  if(proofRequested&&(typeof payload.verificationToken!=='string'||!/^[a-f0-9]{64}$/.test(payload.verificationToken)))fail();
  key=base64(payload.masterKey,32);const names=new Set(),records=[],wallets=new Set(),identities=[];
  for(const record of payload.records){
   if(!record||Object.keys(record).sort().join(',')!=='data,name,sha256'||typeof record.data!=='string'||record.data.length>5464||names.has(record.name))fail();
   const data=Buffer.from(record.data,'base64');if(data.toString('base64')!==record.data||digest(data)!==record.sha256)fail();
   const value=parseRecord(record.name,data,key);names.add(record.name);wallets.add(value.walletAddress);identities.push(value);records.push({name:record.name,data});
  }
  const runtimeDatabases=runtime?inspectPerpsRuntimeRecoveryDatabases(payload.runtimeDatabases,{temporaryDirectory:dirname(destinationDirectory),identities,restorePaused:true,now,allowNonPosixForTests}):null;
  // No plaintext key is written until age authentication, every envelope MAC,
  // owner/address binding and every path has been verified in memory.
  makePrivateDirectory(destinationDirectory,allowNonPosixForTests);
  const restoredWallets=makePrivateDirectory(join(destinationDirectory,'wallets'),allowNonPosixForTests),keys=makePrivateDirectory(join(destinationDirectory,'keys'),allowNonPosixForTests);
  privateWrite(join(restoredWallets,PERPS_CUSTODY_RESTORE_REVIEW_MARKER),Buffer.from(JSON.stringify({archiveSha256:digest(ciphertext),restoredAt:time(now),requiresPausedReconciliation:true})),allowNonPosixForTests);
  const restoredKey=join(keys,'master.key');privateWrite(restoredKey,key,allowNonPosixForTests);
  for(const record of records)privateWrite(join(restoredWallets,record.name),record.data,allowNonPosixForTests);
  const runtimeDirectory=runtimeDatabases?makePrivateDirectory(join(destinationDirectory,'runtime'),allowNonPosixForTests):null;
  if(runtimeDatabases)for(const database of runtimeDatabases)privateWrite(join(runtimeDirectory,database.kind+'.sqlite'),Buffer.from(database.data,'base64'),allowNonPosixForTests);
  // This opaque one-use proof is written only AFTER successful complete restore.
  // It is not a wallet key or trading authorization. Never print its contents.
  const proofFile=proofRequested?join(destinationDirectory,'operator-restore-proof.json'):null;
  if(proofFile)privateWrite(proofFile,Buffer.from(JSON.stringify({format:'jamddmaj-perps-backup-proof/v1',archiveSha256:digest(ciphertext),createdAt:payload.createdAt,restoredAt:time(now),bindings:bindings(identities),verificationToken:payload.verificationToken})),allowNonPosixForTests);
  return Object.freeze({stage:'CUSTODY_KEYS_RESTORED_REVIEW_REQUIRED',directory:restoredWallets,keyFile:restoredKey,walletAddresses:Object.freeze([...wallets].sort()),
   sourceCreatedAt:payload.createdAt,archiveSha256:digest(ciphertext),runtimeStateIncluded:runtimeDatabases!==null,runtimeDirectory,proofFile,requiresPausedReconciliation:true,tradingEnabled:false,readyForSigning:false});
 }catch{fail();}finally{key?.fill(0);plain?.fill(0);}
}
