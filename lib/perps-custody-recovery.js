// Operator-only custody KEY recovery, never an HTTP/browser API or permission
// to trade. Runtime controls/history are not restored or activated by this tool.
import {Encrypter,Decrypter,generateX25519Identity,identityToRecipient} from 'age-encryption';
import {constants,existsSync,mkdirSync,lstatSync,realpathSync,openSync,closeSync,fstatSync,readFileSync,writeFileSync,fsyncSync,readdirSync} from 'node:fs';
import {isAbsolute,resolve,dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,createDecipheriv,createPrivateKey,createPublicKey} from 'node:crypto';
import bs58 from 'bs58';
import {openPerpsCustodyVault,PERPS_CUSTODY_RESTORE_REVIEW_MARKER} from './perps-custody-vault.js';
const FORMAT='jamddmaj-perps-custody-recovery/v1',PURPOSE='jamddmaj-perps-automation',MAX=2*1024*1024;
const IDENTITY='operator-age-identity.txt',RECIPIENT='operator-age-recipient.txt';
const OWNER=/^[a-f0-9]{64}$/,PUBLIC=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let windowsSid;
function fail(){throw Error('PERPS_CUSTODY_RECOVERY_UNAVAILABLE');}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function time(now){const value=now();if(!Number.isSafeInteger(value)||value<0||!Number.isFinite(new Date(value).valueOf()))fail();return value;}
function canonicalPath(path){if(typeof path!=='string'||!isAbsolute(path))fail();return resolve(path);}
function samePath(a,b){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function powershell(script,env={}){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,...env},timeout:10000});}
function sid(){
 if(!windowsSid){windowsSid=powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').trim();if(!/^S-[0-9-]+$/.test(windowsSid))fail();}
 return windowsSid;
}
function windowsPrivate(path,create,directory){
 if(create){
  const owner=sid(),flags=directory?':(OI)(CI)F':':F';
  execFileSync('icacls.exe',[path,'/setowner','*'+owner],{windowsHide:true,stdio:'ignore',timeout:10000});
  execFileSync('icacls.exe',[path,'/inheritance:r','/grant:r','*'+owner+flags,'*S-1-5-18'+flags],{windowsHide:true,stdio:'ignore',timeout:10000});
 }
 const script=`$ErrorActionPreference='Stop'
 $path=$env:JAMDDMAJ_RECOVERY_ACL_PATH
 if([IO.Directory]::Exists($path)){$acl=[IO.Directory]::GetAccessControl($path)}else{$acl=[IO.File]::GetAccessControl($path)}
 $me=$env:JAMDDMAJ_RECOVERY_ACL_OWNER
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me){exit 1}
 $found=$false
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -eq 'Allow'){
   if($rule.IdentityReference.Value -notin @($me,'S-1-5-18')){exit 1}
   if($rule.IdentityReference.Value -eq $me -and (([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::FullControl) -eq [int][Security.AccessControl.FileSystemRights]::FullControl)){$found=$true}
  }
 }
 if(-not $found){exit 1}`;
 powershell(script,{JAMDDMAJ_RECOVERY_ACL_PATH:path,JAMDDMAJ_RECOVERY_ACL_OWNER:sid()});
}
function check(path,directory,tests=false){
 path=canonicalPath(path);const stat=lstatSync(path);
 if(stat.isSymbolicLink()||!samePath(realpathSync(path),path)||(directory?!stat.isDirectory():!stat.isFile())||!directory&&stat.nlink!==1)fail();
 if(process.platform==='win32'){if(!tests)windowsPrivate(path,false,directory);}
 else if(stat.uid!==process.getuid()||(stat.mode&0o077)!==0)fail();
 return {path,stat};
}
function privateRead(path,max,tests=false){
 const before=check(path,false,tests),fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const stat=fstatSync(fd);if(stat.ino!==before.stat.ino||stat.dev!==before.stat.dev||stat.size<1||stat.size>max)fail();return readFileSync(fd);}
 finally{closeSync(fd);}
}
function syncDir(path){if(process.platform==='win32')return;const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function privateWrite(path,data,tests=false){
 check(dirname(path),true,tests);let fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 // Windows ACL tools require an unopened file. The exclusive empty file is
 // already inside the verified private parent; no secret is written yet.
 if(process.platform==='win32'&&!tests){
  const initial=fstatSync(fd);closeSync(fd);windowsPrivate(path,true,false);check(path,false,tests);
  fd=openSync(path,constants.O_WRONLY|(constants.O_NOFOLLOW??0));const actual=fstatSync(fd);
  if(actual.ino!==initial.ino||actual.dev!==initial.dev||actual.size!==0){closeSync(fd);fail();}
 }
 try{check(path,false,tests);writeFileSync(fd,data);fsyncSync(fd);}
 finally{closeSync(fd);}syncDir(dirname(path));
}
function makePrivateDirectory(path,tests=false){
 path=canonicalPath(path);mkdirSync(path,{mode:0o700});if(process.platform==='win32'&&!tests)windowsPrivate(path,true,true);check(path,true,tests);syncDir(dirname(path));return path;
}
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
export async function createPerpsCustodyRecoveryArchive({directory,keyFile,recipient,explicitOperatorApproval,now=Date.now,allowNonPosixForTests=false}={}){
 let key,plain;
 try{
  if(explicitOperatorApproval!==true||typeof recipient!=='string'||!/^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(recipient))fail();
  const encrypter=new Encrypter();encrypter.addRecipient(recipient);
  const vault=openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests});check(directory,true,allowNonPosixForTests);check(dirname(keyFile),true,allowNonPosixForTests);
  key=privateRead(keyFile,32,allowNonPosixForTests);if(key.length!==32)fail();
  const names=readdirSync(directory).sort();if(!names.length||names.length>256)fail();const records=[],wallets=new Set();
  for(const name of names){
   const data=privateRead(join(directory,name),4096,allowNonPosixForTests),identity=parseRecord(name,data,key);
   if(vault.describe(identity).exclusive!==true)fail();wallets.add(identity.walletAddress);
   records.push({name,data:data.toString('base64'),sha256:digest(data)});
  }
  const again=privateRead(keyFile,32,allowNonPosixForTests);try{if(!again.equals(key))fail();}finally{again.fill(0);}
  const createdAt=time(now),payload={format:FORMAT,network:'solana-mainnet',scope:'CUSTODY_KEYS_ONLY',requiresPausedReconciliation:true,createdAt,masterKey:key.toString('base64'),records};
  plain=Buffer.from(JSON.stringify(payload));if(plain.length>MAX)fail();const ciphertext=await encrypter.encrypt(plain);
  return Object.freeze({stage:'ENCRYPTED_CUSTODY_KEYS_ONLY',ciphertext,sha256:digest(ciphertext),createdAt,walletCount:wallets.size,recipient,
   runtimeStateIncluded:false,backupVerified:false,readyForSigning:false});
 }catch{fail();}finally{key?.fill(0);plain?.fill(0);}
}
export async function restorePerpsCustodyRecoveryArchive({ciphertext,operatorDirectory,destinationDirectory,explicitOperatorApproval,now=Date.now,allowNonPosixForTests=false}={}){
 let plain,key;
 try{
  if(explicitOperatorApproval!==true||!(ciphertext instanceof Uint8Array)||ciphertext.length<100||ciphertext.length>MAX+65536)fail();
  destinationDirectory=canonicalPath(destinationDirectory);check(dirname(destinationDirectory),true,allowNonPosixForTests);if(existsSync(destinationDirectory))fail();
  check(operatorDirectory,true,allowNonPosixForTests);
  const identity=privateRead(join(operatorDirectory,IDENTITY),1024,allowNonPosixForTests).toString('utf8').trim(),decrypter=new Decrypter();decrypter.addIdentity(identity);
  plain=await decrypter.decrypt(ciphertext);if(plain.length>MAX)fail();const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
  if(!payload||Object.keys(payload).sort().join(',')!=='createdAt,format,masterKey,network,records,requiresPausedReconciliation,scope'
   ||payload.format!==FORMAT||payload.network!=='solana-mainnet'||payload.scope!=='CUSTODY_KEYS_ONLY'||payload.requiresPausedReconciliation!==true
   ||!Number.isSafeInteger(payload.createdAt)||payload.createdAt<0||payload.createdAt>time(now)+300000||!Array.isArray(payload.records)||!payload.records.length||payload.records.length>256)fail();
  key=base64(payload.masterKey,32);const names=new Set(),records=[],wallets=new Set();
  for(const record of payload.records){
   if(!record||Object.keys(record).sort().join(',')!=='data,name,sha256'||typeof record.data!=='string'||record.data.length>5464||names.has(record.name))fail();
   const data=Buffer.from(record.data,'base64');if(data.toString('base64')!==record.data||digest(data)!==record.sha256)fail();
   const value=parseRecord(record.name,data,key);names.add(record.name);wallets.add(value.walletAddress);records.push({name:record.name,data});
  }
  // No plaintext key is written until age authentication, every envelope MAC,
  // owner/address binding and every path has been verified in memory.
  makePrivateDirectory(destinationDirectory,allowNonPosixForTests);
  const restoredWallets=makePrivateDirectory(join(destinationDirectory,'wallets'),allowNonPosixForTests),keys=makePrivateDirectory(join(destinationDirectory,'keys'),allowNonPosixForTests);
  privateWrite(join(restoredWallets,PERPS_CUSTODY_RESTORE_REVIEW_MARKER),Buffer.from(JSON.stringify({archiveSha256:digest(ciphertext),restoredAt:time(now),requiresPausedReconciliation:true})),allowNonPosixForTests);
  const restoredKey=join(keys,'master.key');privateWrite(restoredKey,key,allowNonPosixForTests);
  for(const record of records)privateWrite(join(restoredWallets,record.name),record.data,allowNonPosixForTests);
  return Object.freeze({stage:'CUSTODY_KEYS_RESTORED_REVIEW_REQUIRED',directory:restoredWallets,keyFile:restoredKey,walletAddresses:Object.freeze([...wallets].sort()),
   sourceCreatedAt:payload.createdAt,archiveSha256:digest(ciphertext),runtimeStateIncluded:false,requiresPausedReconciliation:true,tradingEnabled:false,readyForSigning:false});
 }catch{fail();}finally{key?.fill(0);plain?.fill(0);}
}
