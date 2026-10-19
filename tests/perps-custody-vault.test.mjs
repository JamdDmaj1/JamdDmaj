import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,chmodSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
const ownerAccountHash='a'.repeat(64),allowNonPosixForTests=process.platform==='win32';
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'jamd-custody-test-')),wallets=join(directory,'wallets'),keys=join(directory,'keys'),keyFile=join(keys,'master.key');
 mkdirSync(wallets,{mode:0o700});mkdirSync(keys,{mode:0o700});
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const options={directory:wallets,keyFile,allowNonPosixForTests};createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});
 return {directory,wallets,keyFile,options,vault:openPerpsCustodyVault(options)};
}
test('exclusive wallet creation is explicit, encrypted, restorable and never activates or exports a seed',t=>{
 const f=fixture(t);assert.throws(()=>f.vault.createExclusiveWallet({ownerAccountHash}));
 const first=f.vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}),second=f.vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 assert.notEqual(first.walletAddress,second.walletAddress);assert.equal(first.readyForSigning,false);assert.equal(first.tradingEnabled,false);assert.equal(first.exclusive,true);
 const record=JSON.parse(readFileSync(join(f.wallets,first.walletAddress+'.json'),'utf8'));
 assert.equal(Buffer.from(record.ciphertext,'base64').length,32);assert.equal(Buffer.from(record.iv,'base64').length,12);assert.equal(Buffer.from(record.tag,'base64').length,16);
 assert.deepEqual(openPerpsCustodyVault(f.options).describe(first),first);
 assert.deepEqual(Object.keys(f.vault).sort(),['createExclusiveWallet','describe','signPrepared']);
 assert.throws(()=>f.vault.signPrepared({walletAddress:first.walletAddress,readyForSigning:true}));
 assert.throws(()=>f.vault.describe({...first,ownerAccountHash:'b'.repeat(64)}));
 if(process.platform!=='win32'){assert.equal(statSync(f.keyFile).mode&0o077,0);assert.equal(statSync(join(f.wallets,first.walletAddress+'.json')).mode&0o077,0);}
});
test('master initialization is exclusive and can never overwrite the existing recovery key',t=>{
 const f=fixture(t),before=createHash('sha256').update(readFileSync(f.keyFile)).digest('hex');
 assert.throws(()=>createPerpsCustodyMasterKey(f.keyFile,{allowNonPosixForTests}));
 assert.equal(createHash('sha256').update(readFileSync(f.keyFile)).digest('hex'),before);
});
test('authenticated encryption binds owner, address, purpose and every ciphertext byte',t=>{
 const f=fixture(t),account=f.vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}),path=join(f.wallets,account.walletAddress+'.json'),original=JSON.parse(readFileSync(path,'utf8'));
 for(const change of [{ownerAccountHash:'b'.repeat(64)},{walletAddress:'11111111111111111111111111111111'},{purpose:'arbitrary-transfer'},{version:2},
  {iv:Buffer.alloc(12).toString('base64')},{tag:Buffer.alloc(16).toString('base64')},{ciphertext:Buffer.alloc(32).toString('base64')},{extra:'ignored field'},{ciphertext:original.ciphertext+'\n'}]){
  writeFileSync(path,JSON.stringify({...original,...change}));assert.throws(()=>f.vault.describe(account),/PERPS_EXCLUSIVE_CUSTODY_UNAVAILABLE/);
 }
 writeFileSync(path,JSON.stringify(original));assert.deepEqual(f.vault.describe(account),account);
});
test('encrypted backup is recoverable only with its separate matching master key',t=>{
 const f=fixture(t),account=f.vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const restored=join(f.directory,'restored'),restoredKeys=join(f.directory,'restored-keys');mkdirSync(restored,{mode:0o700});mkdirSync(restoredKeys,{mode:0o700});
 const restoredMaster=join(restoredKeys,'master.key');copyFileSync(f.keyFile,restoredMaster);copyFileSync(join(f.wallets,account.walletAddress+'.json'),join(restored,account.walletAddress+'.json'));
 const vault=openPerpsCustodyVault({directory:restored,keyFile:restoredMaster,allowNonPosixForTests});assert.deepEqual(vault.describe(account),account);
 writeFileSync(restoredMaster,Buffer.alloc(32,12));assert.throws(()=>vault.describe(account));
 assert.deepEqual(f.vault.describe(account),account);
});
test('master and encrypted wallets cannot share the same backup directory',t=>{
 const f=fixture(t),inside=join(f.wallets,'master.key');copyFileSync(f.keyFile,inside);
 assert.throws(()=>openPerpsCustodyVault({...f.options,keyFile:inside}));
 assert.throws(()=>openPerpsCustodyVault({...f.options,directory:'relative-wallets'}));
});
test('production enforces private POSIX permissions; Windows access exists only for explicit isolated tests',t=>{
 const f=fixture(t);
 if(process.platform==='win32'){assert.throws(()=>openPerpsCustodyVault({...f.options,allowNonPosixForTests:false}));return;}
 chmodSync(f.keyFile,0o644);assert.throws(()=>openPerpsCustodyVault(f.options));chmodSync(f.keyFile,0o600);
 chmodSync(f.wallets,0o750);assert.throws(()=>openPerpsCustodyVault(f.options));chmodSync(f.wallets,0o700);
});
