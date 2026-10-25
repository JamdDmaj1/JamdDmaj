import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,pbkdf2Sync} from 'node:crypto';
import {openPortableWalletBackup,sealPortableWalletBackup,validatePortableWalletBackup} from '../lib/portable-wallet-backup.js';
const password='Public recovery fixture: español 🔐';
const entropy=Uint8Array.from({length:32},(_,i)=>i);
const aad=Buffer.concat([Buffer.from([74,65,77,68,72,68,0,1]),Buffer.from('JamdDmaj:wallet-backup:bip39-256-sol501-evm60-v1')]);
function independentFixture(){
 const out=Buffer.alloc(84);aad.copy(out,0,0,8);out.fill(7,8,24);out.fill(9,24,36);
 const key=pbkdf2Sync(password,out.subarray(8,24),600000,32,'sha256');
 try{const cipher=createCipheriv('aes-256-gcm',key,out.subarray(24,36));cipher.setAAD(aad);Buffer.concat([cipher.update(entropy),cipher.final(),cipher.getAuthTag()]).copy(out,36);return out;}finally{key.fill(0);}
}
test('browser recovery matches independently constructed Android-format Unicode fixture',async()=>{
 const bytes=independentFixture(),original=Buffer.from(bytes);const recovered=await openPortableWalletBackup(bytes,password);
 try{assert.deepEqual(recovered,entropy);assert.deepEqual(bytes,original);}finally{recovered.fill(0);}
});

test('offline recovery has no network or persistent-storage dependency',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('Recovery must stay offline');});
 const recovered=await openPortableWalletBackup(independentFixture(),password);
 try{assert.deepEqual(recovered,entropy);}finally{recovered.fill(0);}
});
test('browser backup is recoverable by independent implementation and is randomized',async()=>{
 const a=await sealPortableWalletBackup(entropy,password),b=await sealPortableWalletBackup(entropy,password);assert.notDeepEqual(a,b);assert.equal(a.length,84);
 const key=pbkdf2Sync(password,a.subarray(8,24),600000,32,'sha256');
 try{const decipher=createDecipheriv('aes-256-gcm',key,a.subarray(24,36));decipher.setAAD(aad);decipher.setAuthTag(a.subarray(68));const result=Buffer.concat([decipher.update(a.subarray(36,68)),decipher.final()]);try{assert.deepEqual(new Uint8Array(result),entropy);}finally{result.fill(0);}}finally{key.fill(0);}
});
test('rejects wrong password, tampering, test domain, oversize and malformed UTF16',async()=>{
 const original=independentFixture();await assert.rejects(openPortableWalletBackup(original,'Different long password'),/RECOVERY_FAILED/);
 for(const index of [8,24,36,83]){const changed=Uint8Array.from(original);changed[index]^=1;await assert.rejects(openPortableWalletBackup(changed,password),/RECOVERY_FAILED/);}
 for(const data of [new Uint8Array(85),new Uint8Array(83),Uint8Array.from(original,(v,i)=>i===4?84:v)])assert.throws(()=>validatePortableWalletBackup(data),/UNSUPPORTED/);
 for(const p of ['short','x'.repeat(1025),'x'.repeat(16)+'\ud800','x'.repeat(16)+'\udc00'])await assert.rejects(openPortableWalletBackup(original,p),/INVALID_BACKUP_PASSWORD/);
});
