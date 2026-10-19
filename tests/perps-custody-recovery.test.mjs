import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync,statSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Encrypter,Decrypter} from 'age-encryption';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault,PERPS_CUSTODY_RESTORE_REVIEW_MARKER} from '../lib/perps-custody-vault.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
const allowNonPosixForTests=process.platform==='win32',ownerAccountHash='c'.repeat(64);
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'jamd-recovery-test-'));chmodSync(root,0o700);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const directory=join(root,'wallets'),keys=join(root,'keys'),keyFile=join(keys,'master.key'),operatorDirectory=join(root,'operator');
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});
 const common={allowNonPosixForTests};createPerpsCustodyMasterKey(keyFile,common);
 const vault=openPerpsCustodyVault({directory,keyFile,...common});
 const account=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const request={directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,...common};
 const restore={operatorDirectory,destinationDirectory:join(root,'restored'),explicitOperatorApproval:true,...common};
 return {root,directory,keyFile,vault,account,operator,operatorDirectory,request,restore,common};
}
async function plaintext(f,archive){
 const d=new Decrypter();d.addIdentity(readFileSync(f.operator.identityFile,'utf8').trim());
 return JSON.parse(new TextDecoder().decode(await d.decrypt(archive.ciphertext)));
}
async function encrypt(f,payload){const e=new Encrypter();e.addRecipient(f.operator.recipient);return e.encrypt(new TextEncoder().encode(JSON.stringify(payload)));}

test('operator recovery identity is exclusive, reusable and never returned by initialization',async t=>{
 const f=await fixture(t),before=readFileSync(f.operator.identityFile);
 const again=await initializePerpsOperatorRecovery({directory:f.operatorDirectory,...f.common});
 assert.equal(again.created,false);assert.equal(again.recipient,f.operator.recipient);
 assert.deepEqual(readFileSync(f.operator.identityFile),before);
 assert.equal(JSON.stringify(again).includes(before.toString().trim()),false);
 assert.deepEqual(readdirSync(f.operatorDirectory).sort(),['operator-age-identity.txt','operator-age-recipient.txt']);
 if(process.platform!=='win32'){for(const path of [f.operatorDirectory,f.operator.identityFile,f.operator.recipientFile])assert.equal(statSync(path).mode&0o077,0);}
});

test('recipient without identity is never silently replaced by a new recovery key',async t=>{
 const f=await fixture(t),orphan=join(f.root,'orphan');mkdirSync(orphan,{mode:0o700});
 writeFileSync(join(orphan,'operator-age-recipient.txt'),f.operator.recipient,{mode:0o600});
 await assert.rejects(initializePerpsOperatorRecovery({directory:orphan,...f.common}));
 assert.equal(existsSync(join(orphan,'operator-age-identity.txt')),false);
});

test('encrypted recovery preserves actual unfunded identities but quarantines restoration and cannot resume signing',async t=>{
 const f=await fixture(t),archive=await createPerpsCustodyRecoveryArchive(f.request);
 assert.equal(archive.walletCount,1);assert.equal(archive.backupVerified,false);assert.equal(archive.runtimeStateIncluded,false);
 assert.equal(Buffer.from(archive.ciphertext).includes(readFileSync(f.keyFile)),false);
 assert.equal(Buffer.from(archive.ciphertext).includes(Buffer.from(f.account.walletAddress)),false);
 const restored=await restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext});
 assert.deepEqual(restored.walletAddresses,[f.account.walletAddress]);assert.equal(restored.tradingEnabled,false);assert.equal(restored.readyForSigning,false);
 assert.equal(existsSync(join(restored.directory,PERPS_CUSTODY_RESTORE_REVIEW_MARKER)),true);
 const vault=openPerpsCustodyVault({...restored,...f.common});
 assert.equal(vault.describe(f.account).exclusive,false);assert.equal(vault.describe(f.account).restoreReviewRequired,true);
 assert.throws(()=>vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}));
 assert.throws(()=>vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}));
 assert.throws(()=>vault.signPrepared({}));
 await assert.rejects(createPerpsCustodyRecoveryArchive({...f.request,directory:restored.directory,keyFile:restored.keyFile}));
 await assert.rejects(restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext}));
 assert.deepEqual(readFileSync(restored.keyFile),readFileSync(f.keyFile));
});

test('wrong recovery key, damaged ciphertext and absent operator approval leave no restored plaintext files',async t=>{
 const f=await fixture(t),archive=await createPerpsCustodyRecoveryArchive(f.request),other=join(f.root,'other');
 await initializePerpsOperatorRecovery({directory:other,...f.common});
 const damaged=Uint8Array.from(archive.ciphertext);damaged[damaged.length-1]^=1;
 for(const overrides of [{operatorDirectory:other},{ciphertext:damaged},{explicitOperatorApproval:false}]){
  await assert.rejects(restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext,...overrides}));
  assert.equal(existsSync(f.restore.destinationDirectory),false);
 }
 await assert.rejects(createPerpsCustodyRecoveryArchive({...f.request,explicitOperatorApproval:false}));
 await assert.rejects(createPerpsCustodyRecoveryArchive({...f.request,recipient:'not-an-age-recipient'}));
});

test('authenticated archives still reject path traversal, changed master, envelope MAC, owner and duplicate records before writing',async t=>{
 const f=await fixture(t),archive=await createPerpsCustodyRecoveryArchive(f.request),original=await plaintext(f,archive);
 const mutations=[
  p=>{p.records[0].name='../escaped.json';},
  p=>{p.masterKey=Buffer.alloc(32,9).toString('base64');},
  p=>{p.records.push({...p.records[0]});},
  p=>{p.requiresPausedReconciliation=false;},
  p=>{p.network='solana-devnet';},
  p=>{p.createdAt=Date.now()+3600000;},
  p=>{const r=JSON.parse(Buffer.from(p.records[0].data,'base64'));r.ownerAccountHash='d'.repeat(64);const data=Buffer.from(JSON.stringify(r));p.records[0].data=data.toString('base64');p.records[0].sha256=createHash('sha256').update(data).digest('hex');},
  p=>{const r=JSON.parse(Buffer.from(p.records[0].data,'base64'));r.tag=Buffer.alloc(16,3).toString('base64');const data=Buffer.from(JSON.stringify(r));p.records[0].data=data.toString('base64');p.records[0].sha256=createHash('sha256').update(data).digest('hex');}
 ];
 for(const mutate of mutations){const payload=structuredClone(original);mutate(payload);await assert.rejects(restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:await encrypt(f,payload)}));assert.equal(existsSync(f.restore.destinationDirectory),false);}
});

test('Windows production recovery key initialization restricts ACL without printing identity', {skip:process.platform!=='win32'},async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-recovery-acl-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const directory=join(root,'operator'),first=await initializePerpsOperatorRecovery({directory});
 const again=await initializePerpsOperatorRecovery({directory});assert.equal(again.recipient,first.recipient);assert.equal(again.created,false);
});

test('official age CLI and SDK interoperate in both directions using only unfunded fixture keys', {skip:!process.env.JAMDDMAJ_TEST_AGE_CLI},async t=>{
 const f=await fixture(t),archive=await createPerpsCustodyRecoveryArchive(f.request),binary=process.env.JAMDDMAJ_TEST_AGE_CLI;
 const payload=execFileSync(binary,['--decrypt','--identity',f.operator.identityFile],{input:archive.ciphertext,timeout:10000,maxBuffer:3*1024*1024,stdio:['pipe','pipe','pipe']});
 assert.equal(JSON.parse(payload).records.length,1);
 const ciphertext=execFileSync(binary,['--encrypt','--recipient',f.operator.recipient],{input:payload,timeout:10000,maxBuffer:3*1024*1024,stdio:['pipe','pipe','pipe']});
 const result=await restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext});
 assert.deepEqual(result.walletAddresses,[f.account.walletAddress]);assert.equal(result.tradingEnabled,false);
 payload.fill(0);
});
