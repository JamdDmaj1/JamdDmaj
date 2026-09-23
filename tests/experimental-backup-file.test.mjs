import test from 'node:test';
import assert from 'node:assert/strict';
import {sealTestSecret,openTestSecret,serializeTestBackup,parseTestBackup} from '../lib/experimental-wallet-vault.js';
test('bounded encrypted backup file restores bytes without storing passphrase',async()=>{
 const secret=crypto.getRandomValues(new Uint8Array(32)),password='Disposable file roundtrip test password';
 try{const backup=await sealTestSecret(secret,password),text=serializeTestBackup(backup);
 assert.equal(text.includes(password),false);const restored=await openTestSecret(parseTestBackup(text),password);assert.deepEqual(restored,secret);restored.fill(0);
 for(const malformed of ['', 'null', '[]', 'x'.repeat(2049),JSON.stringify({...backup,network:'mainnet'}),JSON.stringify({...backup,plaintext:'unexpected'}),JSON.stringify({...backup,iv:'00'})])assert.throws(()=>parseTestBackup(malformed));
 }finally{secret.fill(0)}
});
