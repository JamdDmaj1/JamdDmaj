import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {buildRegisterTraderIx,buildOnboardTraderDelegatedIx} from '@ellipsis-labs/rise';
import {preparePhoenixParentOnboarding,simulatePhoenixParentOnboarding,requirePhoenixParentSimulation} from '../lib/phoenix-parent-onboarding.js';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {readPhoenixNativeMarket} from '../lib/phoenix-native-market.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {phoenixRpcAccount,phoenixTraderBytes} from './helpers/phoenix-chain-account-fixture.mjs';
import {capturePhoenixParentSignature,requirePhoenixParentSignature} from '../lib/phoenix-parent-signature.js';
const ONBOARDER='EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z',PERMISSION='6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr';
const AUTHORITY='8wTcJdg4Xw3wnvmBu7Sokn3c2UnnHUhuB5g9sfeCMidR',SYSTEM='11111111111111111111111111111111';
async function fixture(configuration={}){
 const f=await phoenixSimulationFixture(configuration),rent=8371840;f.map.delete(f.parent);
 const permission=Buffer.alloc(168);createHash('sha256').update('account:permission_account').digest().copy(permission,0,0,8);
 permission.set(bs58.decode(AUTHORITY),8);permission.set(bs58.decode(ONBOARDER),40);permission.writeBigUInt64LE(16n,80);permission.writeBigInt64LE(96085n,96);
 f.map.set(PERMISSION,phoenixRpcAccount(ID.program,permission));f.map.set(ONBOARDER,phoenixRpcAccount(SYSTEM,Buffer.alloc(0),100));
 const protocol={programAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:f.exchangeKeys.globalConfig};
 const instructions=[buildRegisterTraderIx({...protocol,payer:f.wallet,trader:f.wallet,traderAccount:f.parent,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0}),
  buildOnboardTraderDelegatedIx({...protocol,authority:ONBOARDER,permissionAccount:PERMISSION,traderAccount:f.parent,globalTraderIndex:f.exchangeKeys.globalTraderIndex,activeTraderBuffer:f.exchangeKeys.activeTraderBuffer})];
 const built={traderPda:f.parent,traderOnboarder:ONBOARDER,txFeePayer:f.wallet,maxPositions:32,includeRegisterTrader:true,instructions:instructions.map(ix=>({programId:ix.programAddress,data:[...ix.data],keys:ix.accounts.map(a=>({pubkey:a.address,isSigner:!!(a.role&2),isWritable:!!(a.role&1)}))}))};
 let preparation,patchPost=null,fee=10000;
 const request=async(method,params)=>{
  if(method==='getFeeForMessage'){assert.equal(params[0],preparation.messageBase64);return {context:{slot:1000},value:fee};}
  if(method==='getMinimumBalanceForRentExemption'){assert.equal(params[0],1520);return rent;}
  if(method==='simulateTransaction'){
   assert.equal(params[0],preparation.serializedTxBase64);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
   const b=phoenixTraderBytes({address:f.parent,wallet:f.wallet,index:0,collateral:0n});b.writeUInt32LE(62,96);
   const post=params[1].accounts.addresses.map(a=>structuredClone(f.map.get(a)??null));
   post[0].lamports-=rent+fee;post[3]=phoenixRpcAccount(ID.program,b,rent);
   const permission=Buffer.from(post[2].data[0],'base64');permission.writeBigInt64LE(permission.readBigInt64LE(96)-1n,96);post[2].data[0]=permission.toString('base64');patchPost?.(post);
   return {context:{slot:1000},value:{err:null,unitsConsumed:30000,accounts:post}};
  }return f.request(method,params);
 };
 const native=await readPhoenixNativeMarket(f.review.plan,{exchangeKeys:f.exchangeKeys,request,now:f.now,monotonicNow:f.monotonicNow});
 const account=await readPhoenixChainAccount({walletAddress:f.wallet},{request,now:f.now,monotonicNow:f.monotonicNow});
 const args={plan:f.review.plan,native,account,built,blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:2000},options={request,now:f.now};
 return {...f,args,options,built,async prepare(changes={}){preparation=await preparePhoenixParentOnboarding({...args,...changes},options);return preparation;},patch(fn){patchPost=fn;},fee(n){fee=n;}};
}
test('parent builder is independently reconstructed and exact two-signer wire simulates only zero-collateral registration',async()=>{
 const f=await fixture(),p=await f.prepare(),r=await simulatePhoenixParentOnboarding(p);
 assert.equal(Buffer.from(p.serializedTxBase64,'base64')[0],2);assert.equal(p.readyForSigning,false);assert.equal(p.requiresProtocolCosignature,true);
 assert.equal(r.maximumLamports,'8381840');assert.equal(r.networkFeeLamports,'10000');assert.equal(r.rentLockedLamports,'8371840');
 assert.equal(requirePhoenixParentSimulation(r,{preparation:p,request:f.options.request}),r);
 assert.throws(()=>requirePhoenixParentSimulation({...r},{preparation:p,request:f.options.request}));
 await assert.rejects(()=>simulatePhoenixParentOnboarding({...p}),/UNVERIFIED/);
 assert.throws(()=>requirePhoenixParentSimulation(r,{preparation:p,request:async()=>null}),/UNVERIFIED/);
 assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('builder changes, extra signer, permission substitution, account spoof and elevated rent cannot pass',async()=>{
 for(const change of [b=>{b.maxPositions=128;},b=>{b.traderOnboarder=fake();},b=>{b.instructions[0].keys[4].isSigner=true;},
  b=>{b.instructions[0].data[8]=128;},b=>{b.instructions[1].keys[4].pubkey=fake();},b=>{b.instructions.push(b.instructions[0]);}]){
  const f=await fixture(),b=structuredClone(f.built);change(b);await assert.rejects(()=>f.prepare({built:b}));
 }
 const f=await fixture();await assert.rejects(()=>f.prepare({account:{...f.args.account}}));
 const g=await fixture(),a=g.map.get(PERMISSION),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(17n,80);a.data[0]=b.toString('base64');await assert.rejects(()=>g.prepare(),/PERMISSION/);
});
function fake(){return bs58.encode(Buffer.alloc(32,9));}
test('partial signature binds both approved message and simulation while retaining the empty provider signature',async()=>{
 const keys=generateKeyPairSync('ed25519'),wallet=bs58.encode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const f=await fixture({wallet}),p=await f.prepare(),simulation=await simulatePhoenixParentOnboarding(p);
 const wire=Buffer.from(p.serializedTxBase64,'base64');sign(null,wire.subarray(129),keys.privateKey).copy(wire,1);
 const result=capturePhoenixParentSignature(p,simulation,wire.toString('base64'),f.options);
 assert.equal(result.readyForBroadcast,false);assert.equal(result.requiresProtocolCosignature,true);
 assert.equal(requirePhoenixParentSignature(result,{preparation:p,simulation,request:f.options.request}),result);
 assert.throws(()=>requirePhoenixParentSignature({...result},{preparation:p,simulation,request:f.options.request}));
 assert.throws(()=>capturePhoenixParentSignature(p,{...simulation},wire.toString('base64'),f.options));
 for(const offset of [1,65,wire.length-1]){const changed=Buffer.from(wire);changed[offset]^=1;assert.throws(()=>capturePhoenixParentSignature(p,simulation,changed.toString('base64'),f.options));}
 const altered=Buffer.from(wire);altered[altered.length-1]^=1;sign(null,altered.subarray(129),keys.privateKey).copy(altered,1);
 assert.throws(()=>capturePhoenixParentSignature(p,simulation,altered.toString('base64'),f.options));
});
test('used parent, exhausted provider quota, stale proof and counterfeit native state cannot prepare registration',async()=>{
 const f=await fixture();f.map.set(f.parent,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.parent,wallet:f.wallet,index:0,collateral:0n})));
 const account=await readPhoenixChainAccount({walletAddress:f.wallet},{...f.options,monotonicNow:f.monotonicNow});
 await assert.rejects(()=>f.prepare({account}),/ALREADY_REGISTERED/);
 const g=await fixture(),a=g.map.get(PERMISSION),b=Buffer.from(a.data[0],'base64');b.writeBigInt64LE(0n,96);a.data[0]=b.toString('base64');await assert.rejects(()=>g.prepare(),/PERMISSION/);
 const h=await fixture();await assert.rejects(()=>h.prepare({native:{...h.args.native}}));
 const p=await h.prepare();h.advance(16000);await assert.rejects(()=>simulatePhoenixParentOnboarding(p),/EXPIRED/);
});
test('simulated unrelated payment, token changes, authority changes and wrong fee cannot authorize setup',async()=>{
 for(const patch of [post=>{post[1].lamports--;},post=>{post[0].lamports--;},post=>{post[3].lamports++;},post=>{post[4].lamports++;},
  post=>{const b=Buffer.from(post[2].data[0],'base64');b.writeBigInt64LE(96085n,96);post[2].data[0]=b.toString('base64');},
  post=>{const b=Buffer.from(post[3].data[0],'base64');b.set(bs58.decode(fake()),120);post[3].data[0]=b.toString('base64');}]){
  const f=await fixture(),p=await f.prepare();f.patch(patch);await assert.rejects(()=>simulatePhoenixParentOnboarding(p));
 }
 const f=await fixture(),p=await f.prepare();f.fee(10001);await assert.rejects(()=>simulatePhoenixParentOnboarding(p),/FEE/);
});
