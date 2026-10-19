import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsCustodyProvisioner,createBoundedPerpsCustodyProvisioner} from '../lib/perps-custody-provisioning.js';
const ownerAccountHash='a'.repeat(64),otherOwner='b'.repeat(64),settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3};
const request={ownerAccountHash,settings,explicitCustodyApproval:true},now=Date.parse('2026-10-19T12:00:00Z');
const allowNonPosixForTests=process.platform==='win32';
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'jamd-provision-')),wallets=join(directory,'wallets'),keys=join(directory,'keys'),path=join(directory,'controls.sqlite');
 mkdirSync(wallets,{mode:0o700});mkdirSync(keys,{mode:0o700});const keyFile=join(keys,'master.key');createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});
 const stores=[],open=()=>{const store=openPerpsAutomationControls(path,{now:()=>now});stores.push(store);return store;},options={directory:wallets,keyFile,allowNonPosixForTests};
 const vault=openPerpsCustodyVault(options),controls=open();
 t.after(()=>{for(const store of stores)try{store.close();}catch{}rmSync(directory,{recursive:true,force:true});});
 return {directory,wallets,path,keyFile,options,vault,controls,open,provisioner:createPerpsCustodyProvisioner({vault,controls})};
}

test('explicit provisioning persists one encrypted owner wallet and paused controls without treating it as funded, backed up or signing-ready',t=>{
 const f=fixture(t),first=f.provisioner.provision(request),again=createPerpsCustodyProvisioner({vault:openPerpsCustodyVault(f.options),controls:f.open()}).provision(request);
 assert.equal(first.walletAddress,again.walletAddress);assert.equal(first.controls.revision,again.controls.revision);assert.equal(first.controls.enabled,false);assert.equal(first.controls.paused,true);
 assert.equal(first.activationChanged,false);assert.equal(first.backupVerified,false);assert.equal(first.fundingAvailable,false);assert.equal(first.readyForSigning,false);
 assert.deepEqual(readdirSync(f.wallets),['owner-'+ownerAccountHash+'.json']);assert.equal(f.controls.audit({ownerAccountHash,walletAddress:first.walletAddress}).length,1);
 assert.throws(()=>f.vault.signPrepared(first));assert.equal(JSON.stringify(first).includes('ciphertext'),false);
});

test('a failure after encrypted wallet persistence recovers the same address rather than losing or rotating the owner key',t=>{
 const f=fixture(t),broken={...f.controls,provision(){throw Error('private storage details');}};
 assert.throws(()=>createPerpsCustodyProvisioner({vault:f.vault,controls:broken}).provision(request),/PERPS_CUSTODY_PROVISIONING_UNAVAILABLE/);
 assert.equal(f.controls.readForOwner({ownerAccountHash}),null);
 const path=join(f.wallets,'owner-'+ownerAccountHash+'.json'),before=readFileSync(path),address=JSON.parse(before).walletAddress;
 const recovered=createPerpsCustodyProvisioner({vault:openPerpsCustodyVault(f.options),controls:f.open()}).provision(request);
 assert.equal(recovered.walletAddress,address);assert.deepEqual(readFileSync(path),before);assert.equal(recovered.controls.paused,true);
});

test('a committed controls write with a lost response is recovered, and later repeated provisioning never resets saved limits',t=>{
 const f=fixture(t),lost={...f.controls,provision(input){f.controls.provision(input);throw Error('response lost');}};
 const first=createPerpsCustodyProvisioner({vault:f.vault,controls:lost}).provision(request);
 const saved=f.controls.save({ownerAccountHash,walletAddress:first.walletAddress,expectedRevision:first.controls.revision,settings:{...settings,leverage:4}});
 const repeated=f.provisioner.provision({...request,settings:{...settings,margin:10}});
 assert.equal(repeated.controls.revision,saved.revision);assert.equal(repeated.controls.settings.leverage,4);assert.equal(repeated.controls.settings.margin,20);
 assert.equal(f.controls.audit({ownerAccountHash,walletAddress:first.walletAddress}).length,2);
});

test('bad consent, invalid risk limits and caller-selected keys fail before creating any wallet',t=>{
 const f=fixture(t);
 for(const input of [{...request,explicitCustodyApproval:false},{...request,ownerAccountHash:'saved-google-profile'},
  {...request,settings:{...settings,margin:9}},{...request,settings:{...settings,loss:101}},
  {...request,walletAddress:'caller-selected'},{...request,seed:'not-accepted'},null])assert.throws(()=>f.provisioner.provision(input),/PERPS_CUSTODY_PROVISIONING_UNAVAILABLE/);
 assert.deepEqual(readdirSync(f.wallets),[]);assert.equal(f.controls.readForOwner({ownerAccountHash}),null);
});

test('another owner and inconsistent existing mappings cannot acquire or replace an exclusive wallet',t=>{
 const f=fixture(t),one=f.provisioner.provision(request),two=f.provisioner.provision({...request,ownerAccountHash:otherOwner});
 assert.notEqual(one.walletAddress,two.walletAddress);assert.throws(()=>f.vault.describe({ownerAccountHash,walletAddress:two.walletAddress}));
 const swapped={...f.controls,readForOwner:()=>two.controls};
 assert.throws(()=>createPerpsCustodyProvisioner({vault:f.vault,controls:swapped}).provision(request));
 assert.equal(f.controls.readForOwner({ownerAccountHash}).walletAddress,one.walletAddress);assert.equal(readdirSync(f.wallets).length,2);
});

test('competing provisioning processes converge to a single encrypted wallet and owner record without automatic activation',async t=>{
 const competitors=Number(process.env.JAMDDMAJ_TEST_PROVISION_COMPETITORS??8);assert.ok(Number.isSafeInteger(competitors)&&competitors>=2&&competitors<=8);
 const f=fixture(t),worker=process.env.JAMDDMAJ_TEST_PROVISION_WORKER||fileURLToPath(new URL('./helpers/perps-provisioning-worker.mjs',import.meta.url));
 const run=()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[worker,JSON.stringify({options:f.options,path:f.path,request,now})],{stdio:['ignore','pipe','pipe']});let output='',errors='';
  child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>errors+=value);child.on('error',reject);
  child.on('close',code=>code===0?resolve(JSON.parse(output)):reject(Error(errors)));
 });
 const replies=await Promise.all(Array.from({length:competitors},run)),successful=replies.filter(reply=>reply.ok);assert.ok(successful.length>=1);
 assert.equal(new Set(successful.map(reply=>reply.wallet)).size,1);const recovered=f.provisioner.provision(request);
 assert.equal(recovered.walletAddress,successful[0].wallet);assert.equal(recovered.controls.enabled,false);assert.equal(recovered.controls.paused,true);
 assert.deepEqual(readdirSync(f.wallets),['owner-'+ownerAccountHash+'.json']);assert.equal(f.controls.audit({ownerAccountHash,walletAddress:recovered.walletAddress}).length,1);
});

test('bounded runtime admission refuses new owners at capacity while preserving idempotent access for existing owners',t=>{
 const f=fixture(t),options={directory:f.wallets,vault:f.vault,controls:f.controls,maximumWalletFiles:1,allowNonPosixForTests};
 const bounded=createBoundedPerpsCustodyProvisioner(options),first=bounded.provision(request);
 assert.throws(()=>bounded.provision({...request,ownerAccountHash:otherOwner}),/PERPS_CUSTODY_CAPACITY_REACHED/);
 assert.equal(bounded.provision(request).walletAddress,first.walletAddress);assert.equal(readdirSync(f.wallets).length,1);
 assert.equal(f.controls.readForOwner({ownerAccountHash:otherOwner}),null);assert.equal(first.readyForSigning,false);
 for(const maximumWalletFiles of [0,257,'1',NaN,Infinity])assert.throws(()=>createBoundedPerpsCustodyProvisioner({...options,maximumWalletFiles}));
});

test('a persisted wallet with a failed controls write counts against capacity but its owner can recover at full capacity',t=>{
 const f=fixture(t),broken={...f.controls,provision(){throw Error('fixture write failure');}};
 const options={directory:f.wallets,vault:f.vault,maximumWalletFiles:1,allowNonPosixForTests};
 assert.throws(()=>createBoundedPerpsCustodyProvisioner({...options,controls:broken}).provision(request));
 assert.equal(f.controls.readForOwner({ownerAccountHash}),null);
 const bytes=readFileSync(join(f.wallets,'owner-'+ownerAccountHash+'.json'));
 const bounded=createBoundedPerpsCustodyProvisioner({...options,controls:f.controls});
 assert.throws(()=>bounded.provision({...request,ownerAccountHash:otherOwner}),/PERPS_CUSTODY_CAPACITY_REACHED/);
 const recovered=bounded.provision(request);assert.equal(recovered.walletAddress,JSON.parse(bytes).walletAddress);
 assert.deepEqual(readFileSync(join(f.wallets,'owner-'+ownerAccountHash+'.json')),bytes);assert.equal(recovered.controls.paused,true);
});
