import test from 'node:test';
import assert from 'node:assert/strict';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {buildEligibilityTree} from '../lib/fair-launch-eligibility.js';
import {eligibilityExportSigningBytes,verifyEligibilityProviderExport} from '../lib/fair-launch-provider-export.js';
const secret=new Uint8Array(32).fill(4),policy='FuKZeMjTCFJRcYYfSxAa62EHM4sqx7RqH1SNTapUgc7r',now=Date.parse('2026-10-31T12:00:00.000Z');
const provider={id:'fixture-provider',publicKey:bs58.encode(ed25519.getPublicKey(secret)),rulesetHash:'a'.repeat(64)};
async function fixture(){const records=[{identityCommitment:'b'.repeat(64),beneficiary:'2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom',totalAllocation:'10'}];const tree=await buildEligibilityTree(policy,records);return sign({schema:'jamddmaj-eligibility-export/v1',cluster:'solana:devnet',providerId:provider.id,policyAddress:policy,rulesetHash:provider.rulesetHash,generatedAt:new Date(now).toISOString(),count:1,root:tree.root,records,signature:''});}
function sign(p){return {...p,signature:bs58.encode(ed25519.sign(eligibilityExportSigningBytes(p),secret))};}
const context={provider,policyAddress:policy,totalSupplyBaseUnits:'10000',now};
test('provider signature and root are checked offline but never approve people or mainnet',async()=>{const p=await fixture();const r=await verifyEligibilityProviderExport(p,context);assert.equal(r.providerSignatureValid,true);assert.equal(r.merkleRootValid,true);assert.equal(r.eligibilityApproved,false);assert.equal(r.mainnetAuthorized,false);assert.equal(r.reviewRequired,true);});
test('unconfigured provider, changed identity/rules, expiry and personal-data fields fail closed',async()=>{
 const p=await fixture();await assert.rejects(verifyEligibilityProviderExport(p,{}),/PROVIDER_REQUIRED/);
 for(const patch of [{providerId:'other'},{policyAddress:'other'},{rulesetHash:'c'.repeat(64)}])await assert.rejects(verifyEligibilityProviderExport({...p,...patch},context),/BINDING/);
 await assert.rejects(verifyEligibilityProviderExport({...p,signature:bs58.encode(new Uint8Array(64))},context),/SIGNATURE/);
 await assert.rejects(verifyEligibilityProviderExport(sign({...p,generatedAt:'2026-10-01T12:00:00.000Z'}),context),/EXPIRED/);
 await assert.rejects(verifyEligibilityProviderExport({...p,records:[{...p.records[0],name:'must-not-be-imported'}]},context),/PERSONAL_DATA/);
 await assert.rejects(verifyEligibilityProviderExport({...p,records:[{...p.records[0],totalAllocation:'101'}]},context),/WALLET_CAP/);
 await assert.rejects(verifyEligibilityProviderExport(sign({...p,root:'f'.repeat(64)}),context),/ROOT/);
 for(const totalAllocation of [10,'01','1e2','18446744073709551616'])await assert.rejects(verifyEligibilityProviderExport({...p,records:[{...p.records[0],totalAllocation}]},context),/ALLOCATION/);
 await assert.rejects(verifyEligibilityProviderExport(p,{...context,totalSupplyBaseUnits:10000}),/SUPPLY/);
});
