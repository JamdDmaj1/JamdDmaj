import test from 'node:test';
import assert from 'node:assert/strict';
import {sealTestSecret,openTestSecret} from '../lib/experimental-wallet-vault.js';
const password='test-only recovery passphrase';
test('offline test vault recovers the exact secret from serialized backup',async()=>{
 const seed=crypto.getRandomValues(new Uint8Array(32));
 const backup=await sealTestSecret(seed,password);
 const recovered=await openTestSecret(JSON.parse(JSON.stringify(backup)),password);
 assert.deepEqual(recovered,seed);
 assert.ok(!JSON.stringify(backup).includes(Buffer.from(seed).toString('hex')));
 recovered.fill(0);seed.fill(0);
});
test('wrong passphrase, altered ciphertext and mainnet backup are rejected',async()=>{
 const backup=await sealTestSecret(new Uint8Array(32),password);
 await assert.rejects(openTestSecret(backup,'a different test password'));
 const changed=(backup.ciphertext[0]==='0'?'1':'0')+backup.ciphertext.slice(1);
 await assert.rejects(openTestSecret({...backup,ciphertext:changed},password));
 await assert.rejects(openTestSecret({...backup,network:'mainnet'},password));
 await assert.rejects(openTestSecret({...backup,iterations:1},password));
});
test('each encryption uses a new salt and IV; short passwords rejected',async()=>{
 const seed=new Uint8Array(32);
 const a=await sealTestSecret(seed,password),b=await sealTestSecret(seed,password);
 assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
 await assert.rejects(sealTestSecret(seed,'short'));
});
