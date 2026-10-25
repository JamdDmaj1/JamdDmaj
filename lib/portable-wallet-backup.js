// Android PortableWalletBackup interoperability. Offline recovery primitive only.
// Not wired to production UI or signing. Never upload backup/password/plaintext.
const header=Uint8Array.of(74,65,77,68,72,68,0,1);
const encoder=new TextEncoder();
const context=encoder.encode('JamdDmaj:wallet-backup:bip39-256-sol501-evm60-v1');
const aad=new Uint8Array(header.length+context.length);aad.set(header);aad.set(context,header.length);
function validPassword(password){
 if(typeof password!=='string'||password.length<16||password.length>1024)throw Error('INVALID_BACKUP_PASSWORD');
 // Match Java: reject malformed UTF-16, preserve exact UTF-8; no normalization.
 for(let i=0;i<password.length;i++){
  const c=password.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const next=password.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('INVALID_BACKUP_PASSWORD');}
  else if(c>=0xdc00&&c<=0xdfff)throw Error('INVALID_BACKUP_PASSWORD');
 }
}
async function key(password,salt){
 validPassword(password);const bytes=encoder.encode(password);
 try{
  const base=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
  return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }finally{bytes.fill(0);}
}
export function validatePortableWalletBackup(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==84||header.some((value,index)=>bytes[index]!==value))throw Error('UNSUPPORTED_WALLET_BACKUP');
 return true;
}
export async function openPortableWalletBackup(bytes,password){
 validatePortableWalletBackup(bytes);validPassword(password);
 const copy=Uint8Array.from(bytes);let plaintext;
 try{
  plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:copy.subarray(24,36),additionalData:aad,tagLength:128},await key(password,copy.subarray(8,24)),copy.subarray(36)));
  if(plaintext.length!==32)throw Error();
  return plaintext; // Caller owns this buffer and MUST wipe it after derivation.
 }catch{plaintext?.fill(0);throw Error('BACKUP_RECOVERY_FAILED');}
 finally{copy.fill(0);}
}
export async function sealPortableWalletBackup(entropy,password){
 if(!(entropy instanceof Uint8Array)||entropy.length!==32)throw Error('INVALID_WALLET_ENTROPY');
 validPassword(password);const copy=Uint8Array.from(entropy),out=new Uint8Array(84);
 out.set(header);crypto.getRandomValues(out.subarray(8,24));crypto.getRandomValues(out.subarray(24,36));
 try{
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:out.subarray(24,36),additionalData:aad,tagLength:128},await key(password,out.subarray(8,24)),copy);
  out.set(new Uint8Array(encrypted),36);return out;
 }finally{copy.fill(0);}
}
