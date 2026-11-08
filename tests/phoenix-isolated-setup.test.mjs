import test from 'node:test';
import assert from 'node:assert/strict';
import {getRegisterTraderInstructionDecoder,getUpdateTraderPreferenceBitsDecoder} from '@ellipsis-labs/rise';
import {buildPhoenixIsolatedSetup,requirePhoenixIsolatedSetup} from '../lib/phoenix-isolated-setup.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
const fresh=f=>readPhoenixChainAccount({walletAddress:f.wallet,subaccountIndices:[1]},{request:f.request,now:f.now,monotonicNow:f.monotonicNow});
function edit(f,address,fn){const a=f.map.get(address),b=Buffer.from(a.data[0],'base64');fn(b);a.data=[b.toString('base64'),'base64'];}
const args=(f,account)=>({plan:f.review.plan,native:f.native,account});
const options=f=>({request:f.request,now:f.now});

test('new child protects parent first, then registers one position, syncs and restores child policy',async()=>{
 const f=await phoenixSimulationFixture();f.map.delete(f.a.trader);edit(f,f.parent,b=>b.writeUInt32LE(0,116));
 const account=await fresh(f),setup=await buildPhoenixIsolatedSetup(args(f,account),options(f));
 assert.equal(setup.createsAccount,true);assert.equal(setup.accountDataBytes,280);assert.equal(setup.instructions.length,4);assert.equal(setup.readyForSigning,false);
 assert.equal(setup.instructions[0].accounts[5].address,f.parent);assert.equal(setup.instructions[3].accounts[5].address,f.a.trader);
 const register=getRegisterTraderInstructionDecoder().decode(Uint8Array.from(setup.instructions[1].data));
 assert.equal(register.maxPositions,1n);assert.equal(register.traderPreferenceBits,1);assert.equal(register.traderPdaIndex,0);assert.equal(register.subaccountIndex,1);
 const policy=getUpdateTraderPreferenceBitsDecoder().decode(Uint8Array.from(setup.instructions[0].data));
 assert.deepEqual(policy.toggles,[{target:0,set:false}]);
 assert.ok(setup.instructions.every(ix=>ix.accounts.filter(a=>(a.role&2)!==0).every(a=>a.address===f.wallet)));
 assert.equal(requirePhoenixIsolatedSetup(setup).setup,setup);assert.throws(()=>requirePhoenixIsolatedSetup({...setup}));
});
test('existing protected account needs no transaction or duplicated rent',async()=>{
 const f=await phoenixSimulationFixture(),setup=await buildPhoenixIsolatedSetup(args(f,f.account),options(f));
 assert.equal(setup.createsAccount,false);assert.equal(setup.accountDataBytes,0);assert.equal(setup.instructions.length,0);
});
test('existing child repair only changes the necessary preference, never repeats sync',async()=>{
 const f=await phoenixSimulationFixture();edit(f,f.a.trader,b=>b.writeUInt32LE(0,116));
 const setup=await buildPhoenixIsolatedSetup(args(f,await fresh(f)),options(f));assert.equal(setup.instructions.length,1);assert.equal(setup.createsAccount,false);
 assert.equal(setup.instructions[0].accounts[5].address,f.a.trader);
});
test('setup refuses missing parent, foreign delegate and unaccounted parent collateral',async()=>{
 const a=await phoenixSimulationFixture();a.map.delete(a.parent);await assert.rejects(()=>fresh(a).then(account=>buildPhoenixIsolatedSetup(args(a,account),options(a))),/PARENT_ONBOARDING/);
 const b=await phoenixSimulationFixture();edit(b,b.a.trader,data=>data.set(new Uint8Array(32).fill(8),120));await assert.rejects(()=>fresh(b).then(account=>buildPhoenixIsolatedSetup(args(b,account),options(b))),/AUTHORITY/);
 const c=await phoenixSimulationFixture();edit(c,c.parent,data=>{data.writeUInt32LE(0,116);data.writeBigInt64LE(1n,88);});await assert.rejects(()=>fresh(c).then(account=>buildPhoenixIsolatedSetup(args(c,account),options(c))),/PARENT_UNMANAGED/);
 const d=await phoenixSimulationFixture();await assert.rejects(()=>buildPhoenixIsolatedSetup({...args(d,d.account),account:{...d.account}},options(d)));
 const e=await phoenixSimulationFixture();await assert.rejects(()=>buildPhoenixIsolatedSetup({...args(e,e.account),native:{...e.native}},options(e)));
});
