// Linux VPS custody for the separately approved, limited-capital bot wallet.
// No seed import/export, arbitrary-message signer, transfer or networking API.
import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readFileSync,writeFileSync,fsyncSync,readdirSync} from 'node:fs';
import {isAbsolute,resolve,dirname,join,relative,sep} from 'node:path';
import {randomBytes,createPrivateKey,createPublicKey,createCipheriv,createDecipheriv,sign} from 'node:crypto';
import bs58 from 'bs58';
import {consumeServerPerpsSigningAuthorization} from './perps-server-signing-authorization.js';
import {verifyOwnerSignedServerPerpsEnvelope} from './perps-server-signed-envelope.js';
import {consumeServerPerpsExitCancellationAuthorization,verifyOwnerSignedPerpsExitCancellation} from './perps-exit-cancellation-signing.js';
import {consumePerpsCloseConversionAuthorization,verifyAuthorizedPerpsCloseConversionSignature} from './perps-close-conversion-signing.js';
import {consumeNativePerpsCloseAuthorization,verifyAuthorizedNativePerpsCloseSignature} from './perps-close-signing.js';
const PURPOSE='jamddmaj-perps-automation',SEED_PREFIX=Buffer.from('302e020100300506032b657004220420','hex');
export const PERPS_CUSTODY_RESTORE_REVIEW_MARKER='.restore-review-required.json';
function fail(){throw Error('PERPS_EXCLUSIVE_CUSTODY_UNAVAILABLE');}
function owner(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function wallet(value){try{const b=bs58.decode(value);if(b.length!==32||bs58.encode(b)!==value)fail();return value;}catch{fail();}}
function secureStat(stat,directory){
 if(directory?!stat.isDirectory():!stat.isFile())fail();
 if(process.platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid()||!directory&&stat.nlink!==1))fail();
}
function privateDirectory(path){
 if(typeof path!=='string'||!isAbsolute(path)||lstatSync(path).isSymbolicLink())fail();
 const actual=realpathSync(path),requested=resolve(path),normalize=s=>process.platform==='win32'?s.toLowerCase():s;
 if(normalize(actual)!==normalize(requested))fail();secureStat(lstatSync(actual),true);return actual;
}
function readPrivate(path,maxBytes,durable=false){
 const before=lstatSync(path);if(before.isSymbolicLink())fail();secureStat(before,false);
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const after=fstatSync(fd);secureStat(after,false);if(after.ino!==before.ino||after.dev!==before.dev||after.size<1||after.size>maxBytes)fail();const value=readFileSync(fd);if(durable&&process.platform!=='win32')fsyncSync(fd);return value;}
 finally{closeSync(fd);}
}
function syncDirectory(path){if(process.platform==='win32')return;const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function createPrivate(path,data){
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(dirname(path));
}
function posixOnly(allowNonPosixForTests){if(process.platform==='win32'&&allowNonPosixForTests!==true)fail();}
export function createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests=false}={}){
 posixOnly(allowNonPosixForTests);if(typeof keyFile!=='string'||!isAbsolute(keyFile))fail();privateDirectory(dirname(keyFile));
 const key=randomBytes(32);try{createPrivate(keyFile,key);}catch{fail();}finally{key.fill(0);}
 return Object.freeze({created:true});
}
function aad(ownerAccountHash,walletAddress){return Buffer.from(JSON.stringify({version:1,purpose:PURPOSE,ownerAccountHash,walletAddress}));}
function privateKey(seed){const der=Buffer.concat([SEED_PREFIX,seed]);try{return createPrivateKey({key:der,format:'der',type:'pkcs8'});}finally{der.fill(0);}}
function address(key){return bs58.encode(createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32));}
function bytes(text,length){if(typeof text!=='string')fail();const b=Buffer.from(text,'base64');if(b.length!==length||b.toString('base64')!==text)fail();return b;}
function exists(path){try{lstatSync(path);return true;}catch(error){if(error?.code==='ENOENT')return false;fail();}}
function identity(ownerAccountHash,walletAddress){return Object.freeze({walletAddress,ownerAccountHash,purpose:PURPOSE,exclusive:true,readyForSigning:false,tradingEnabled:false});}
export function openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests=false}={}){
 posixOnly(allowNonPosixForTests);directory=privateDirectory(directory);
 if(typeof keyFile!=='string'||!isAbsolute(keyFile))fail();privateDirectory(dirname(keyFile));keyFile=resolve(keyFile);
 const keyRelative=relative(directory,keyFile);if(keyRelative===''||keyRelative!=='..'&&!keyRelative.startsWith('..'+sep)&&!isAbsolute(keyRelative))fail();
 // Validate configuration without retaining a master secret in a JS closure.
 const initial=readPrivate(keyFile,32);try{if(initial.length!==32)fail();}finally{initial.fill(0);}
 function master(){const key=readPrivate(keyFile,32);if(key.length!==32){key.fill(0);fail();}return key;}
 const restoreMarker=join(directory,PERPS_CUSTODY_RESTORE_REVIEW_MARKER);
 function requireReviewed(){if(exists(restoreMarker))fail();}
 function ownerPath(ownerAccountHash){return join(directory,'owner-'+owner(ownerAccountHash)+'.json');}
 function readEnvelope(path,ownerAccountHash,walletAddress=null,durable=false){
  owner(ownerAccountHash);if(walletAddress!==null)wallet(walletAddress);
  let envelope;try{envelope=JSON.parse(readPrivate(path,4096,durable).toString('utf8'));}catch{fail();}
  if(!envelope||Object.keys(envelope).sort().join(',')!=='ciphertext,iv,ownerAccountHash,purpose,tag,version,walletAddress'
    ||envelope.version!==1||envelope.purpose!==PURPOSE||envelope.ownerAccountHash!==ownerAccountHash||walletAddress!==null&&envelope.walletAddress!==walletAddress)fail();
  wallet(envelope.walletAddress);return envelope;
 }
 function decryptEnvelope(envelope){
  const {ownerAccountHash,walletAddress}=envelope;
  const key=master();let seed;
  try{
   const decipher=createDecipheriv('aes-256-gcm',key,bytes(envelope.iv,12));decipher.setAAD(aad(ownerAccountHash,walletAddress));decipher.setAuthTag(bytes(envelope.tag,16));
   seed=Buffer.concat([decipher.update(bytes(envelope.ciphertext,32)),decipher.final()]);if(seed.length!==32)fail();
   const signer=privateKey(seed);if(address(signer)!==walletAddress)fail();return signer;
  }catch{fail();}finally{key.fill(0);seed?.fill(0);}
 }
 function decrypt(ownerAccountHash,walletAddress){
  owner(ownerAccountHash);wallet(walletAddress);const legacy=join(directory,walletAddress+'.json');
  return decryptEnvelope(readEnvelope(exists(legacy)?legacy:ownerPath(ownerAccountHash),ownerAccountHash,walletAddress));
 }
 function encryptedEnvelope(ownerAccountHash){
  const key=master();let seed;
  try{
   seed=randomBytes(32);
   const walletAddress=address(privateKey(seed)),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(ownerAccountHash,walletAddress));
   const ciphertext=Buffer.concat([cipher.update(seed),cipher.final()]);
   return {version:1,purpose:PURPOSE,ownerAccountHash,walletAddress,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
  }finally{seed?.fill(0);key.fill(0);}
 }
 function existingLegacyEnvelope(ownerAccountHash){
  const names=readdirSync(directory);if(names.length>4096)fail();let found;
  for(const name of names){
   if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}\.json$/.test(name))continue;
   const path=join(directory,name);let candidate;
   try{candidate=JSON.parse(readPrivate(path,4096).toString('utf8'));}catch{fail();}
   const envelope=readEnvelope(path,owner(candidate?.ownerAccountHash),name.slice(0,-5));
   if(envelope.ownerAccountHash!==ownerAccountHash)continue;
   if(found)fail();decryptEnvelope(envelope);found=envelope;
  }
  return found;
 }
 return Object.freeze({
  createExclusiveWallet({ownerAccountHash,explicitCustodyApproval}={}){
   requireReviewed();
   owner(ownerAccountHash);if(explicitCustodyApproval!==true)fail();
   try{
    const envelope=encryptedEnvelope(ownerAccountHash),walletAddress=envelope.walletAddress;
    createPrivate(join(directory,walletAddress+'.json'),Buffer.from(JSON.stringify(envelope)));
    return identity(ownerAccountHash,walletAddress);
   }catch{fail();}
  },
  createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval}={}){
   requireReviewed();
   owner(ownerAccountHash);if(explicitCustodyApproval!==true)fail();
   // One immutable encrypted record per authenticated owner. Persisting the
   // owner binding and encrypted seed in the SAME file avoids a crash between
   // separately writing a wallet and its owner index. No plaintext seed leaves.
   const path=ownerPath(ownerAccountHash);
   if(!exists(path)){
    // A legacy wallet may already have been shown to its owner before this
    // idempotent format existed. Adopt exactly one verified existing key; an
    // ambiguous owner requires review instead of silently choosing/rotating it.
    const envelope=existingLegacyEnvelope(ownerAccountHash)??encryptedEnvelope(ownerAccountHash);
    try{createPrivate(path,Buffer.from(JSON.stringify(envelope)));}
    catch(error){if(error?.code!=='EEXIST')fail();}
   }
   // A concurrent writer's incomplete record fails closed; a later explicit
   // retry reads the completed record instead of generating a second address.
   const envelope=readEnvelope(path,ownerAccountHash,null,true);decryptEnvelope(envelope);syncDirectory(directory);
   return identity(ownerAccountHash,envelope.walletAddress);
  },
  describe({ownerAccountHash,walletAddress}={}){
   decrypt(ownerAccountHash,walletAddress);
   if(exists(restoreMarker))return Object.freeze({...identity(ownerAccountHash,walletAddress),exclusive:false,restoreReviewRequired:true});
   return identity(ownerAccountHash,walletAddress);
  },
  signNativeClose(grant){
   requireReviewed();const authority=consumeNativePerpsCloseAuthorization(grant);
   const signer=decrypt(authority.ownerAccountHash,authority.walletAddress);authority.revalidate();requireReviewed();
   const wire=Buffer.from(authority.serializedTxBase64,'base64');
   if(wire[0]!==3||wire.subarray(1,129).some(b=>b!==0))fail();
   sign(null,wire.subarray(193),signer).copy(wire,1);authority.revalidate();requireReviewed();
   return verifyAuthorizedNativePerpsCloseSignature(wire.toString('base64'),authority);
  },
  signCloseConversion(grant){
   requireReviewed();const authority=consumePerpsCloseConversionAuthorization(grant);
   const signer=decrypt(authority.ownerAccountHash,authority.walletAddress);authority.revalidate();requireReviewed();
   const wire=Buffer.from(authority.wire.serializedTxBase64,'base64');
   if(wire[0]!==1||wire.subarray(1,65).some(b=>b!==0))fail();
   sign(null,wire.subarray(65),signer).copy(wire,1);authority.revalidate();requireReviewed();
   return verifyAuthorizedPerpsCloseConversionSignature(wire.toString('base64'),authority);
  },
  signExitCancellation(grant){
   requireReviewed();const authorization=consumeServerPerpsExitCancellationAuthorization(grant);
   const signer=decrypt(authorization.ownerAccountHash,authorization.walletAddress);authorization.revalidate();requireReviewed();
   const wire=Buffer.from(authorization.inspection.envelope.serializedTxBase64,'base64');
   if(wire[0]!==3||wire.subarray(1,129).some(b=>b!==0))fail();
   sign(null,wire.subarray(193),signer).copy(wire,1);authorization.revalidate();requireReviewed();
   return verifyOwnerSignedPerpsExitCancellation(wire.toString('base64'),authorization);
  },
  signPrepared(grant){
   requireReviewed();
   const authorization=consumeServerPerpsSigningAuthorization(grant);
   const signer=decrypt(authorization.ownerAccountHash,authorization.walletAddress);
   authorization.revalidate();requireReviewed();
   const wire=Buffer.from(authorization.prepared.preparation.serializedTxBase64,'base64');
   if(wire[0]!==3||wire.subarray(1,129).some(b=>b!==0))fail();
   sign(null,wire.subarray(193),signer).copy(wire,1);
   authorization.revalidate();requireReviewed();
   return verifyOwnerSignedServerPerpsEnvelope(authorization.prepared,wire.toString('base64'),authorization);
  }
 });
}
