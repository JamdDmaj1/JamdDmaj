import test from 'node:test';
import assert from 'node:assert/strict';
import {getWithdrawFundsDecoder,getEmberWithdrawDecoder,buildWithdrawIxsResolved} from '@ellipsis-labs/rise';
import {readPhoenixCollateralContext,preparePhoenixCollateral,requirePhoenixCollateralPreparation} from '../lib/phoenix-collateral.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {phoenixNativeMarketFixture} from './helpers/phoenix-native-market-fixture.mjs';
import {phoenixTraderBytes,phoenixRpcAccount,phoenixTokenBytes} from './helpers/phoenix-chain-account-fixture.mjs';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {buildPhoenixCollateralWire,simulatePhoenixCollateral,requirePhoenixCollateralSimulation} from '../lib/phoenix-collateral-simulation.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
async function fixture({canonical=0n,collateral=10010000n,queued=false}={}){
 const f=await phoenixNativeMarketFixture(),map=new Map([...f.nativeMap,...f.map]);
 const parent=Buffer.from(map.get(f.parent).data[0],'base64');parent.writeUInt32LE(1,116);map.set(f.parent,phoenixRpcAccount(ID.program,parent));
 const child=phoenixTraderBytes({address:f.a.trader,baseLots:0n,virtualQuoteLots:0n,collateral});
 if(queued)child.writeUInt32LE(1,108);
 // Queue flags are exercised using the actual SDK layout in the account reader.
 map.set(f.a.trader,phoenixRpcAccount(ID.program,child));
 map.set(f.a.canonicalAta,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,f.wallet,canonical)));
 let extra=null;const calls=[];const request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(extra){const result=await extra(method,params);if(result!==undefined)return result;}
  if(method!=='getMultipleAccounts')throw Error('NO_WRITE_OR_PRICE_ALLOWED');
  return {context:{slot:1000},value:params[0].map(address=>{const a=map.get(address);if(!a)return null;const s=params[1].dataSlice;
   return s?{...a,data:[Buffer.from(a.data[0],'base64').subarray(s.offset,s.offset+s.length).toString('base64'),'base64']}:a;})};
 };
 const options={request,now:f.now,monotonicNow:f.monotonicNow};
 const context=await readPhoenixCollateralContext({walletAddress:f.wallet,minimumSlot:1000},options);
 const readAccount=()=>readPhoenixChainAccount({walletAddress:f.wallet,subaccountIndices:[1]},options);
 const account=await readAccount();return {...f,map,context,account,request,calls,options,readAccount,setRpc(fn){extra=fn;}};
}
test('collateral routing uses native mainnet configuration, with no catalog or price dependency',async()=>{
 const f=await fixture();assert.equal(f.context.exchangeKeys.perpAssetMap,f.exchangeKeys.perpAssetMap);
 assert.equal(f.context.exchangeKeys.withdrawQueue,f.exchangeKeys.withdrawQueue);
 assert.ok(f.calls.every(c=>['getGenesisHash','getMultipleAccounts'].includes(c.method)));
 const p=await preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1},{request:f.request});
 assert.equal(p.phase,'WITHDRAW');assert.equal(p.amountUnits,'10010000');assert.equal(p.instructions.length,2);
 assert.equal(getWithdrawFundsDecoder().decode(Uint8Array.from(p.instructions[1].data)),10010000n);
 assert.equal(p.walletCredited,false);assert.equal(p.readyForSigning,false);
 assert.equal(requirePhoenixCollateralPreparation(p).account,f.account);
 assert.throws(()=>requirePhoenixCollateralPreparation({...p}),/UNVERIFIED/);
 f.advance(20000); // The original order/catalog/quote have now expired.
 const freshContext=await readPhoenixCollateralContext({walletAddress:f.wallet},f.options),freshAccount=await f.readAccount();
 const payout=await preparePhoenixCollateral({context:freshContext,account:freshAccount,subaccountIndex:1},{request:f.request});
 assert.equal(payout.amountUnits,'10010000');
});
test('unwrap only the exact requested confirmed amount and revoke its temporary allowance',async()=>{
 const f=await fixture({canonical:10010001n,collateral:0n});
 const p=await preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1,phase:'UNWRAP',amountUnits:'10010000'},{request:f.request});
 assert.equal(p.instructions.length,4);assert.equal(p.instructions[0].data[0],4);assert.equal(p.instructions[3].data[0],5);
 assert.equal(getEmberWithdrawDecoder().decode(p.instructions[2].data),10010000n);
 const sdk=buildWithdrawIxsResolved({exchange:{phoenixProgramAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:f.context.exchangeKeys.globalConfig,
  ...f.context.exchangeKeys,usdcMint:ID.usdc,emberState:f.a.emberState,emberVault:f.a.emberVault},
  trader:{authority:f.wallet,traderAccount:f.a.trader,usdcTokenAccount:f.a.usdcAta,phoenixTokenAccount:f.a.canonicalAta},amount:10010000n});
 assert.deepEqual(p.instructions[2].accounts,sdk.named.emberWithdraw.accounts);
 assert.deepEqual(p.instructions[2].data,[...sdk.named.emberWithdraw.data]);
 assert.equal(p.requiresFinalizedPayoutBinding,true);assert.equal(p.walletCredited,false);
 await assert.rejects(()=>preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1,phase:'UNWRAP',amountUnits:'10010002'},{request:f.request}),/PAYOUT_NOT_AVAILABLE/);
});
test('live exposure, unproven routing, stale accounts, missing payout and foreign delegate cannot prepare payout',async()=>{
 const f=await fixture();
 await assert.rejects(()=>preparePhoenixCollateral({context:{...f.context},account:f.account,subaccountIndex:1},{request:f.request}),/UNVERIFIED/);
 await assert.rejects(()=>preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1,phase:'UNWRAP',amountUnits:'1'},{request:f.request}),/PAYOUT_NOT_AVAILABLE/);
 f.map.set(f.a.trader,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.a.trader,baseLots:-240n})));
 const live=await f.readAccount();await assert.rejects(()=>preparePhoenixCollateral({context:f.context,account:live,subaccountIndex:1},{request:f.request}),/ACCOUNT_POLICY/);
 f.advance(10001);await assert.rejects(()=>preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1},{request:f.request}),/EXPIRED/);
});
test('foreign vault identity and wrong network never produce native collateral routing',async()=>{
 const f=await fixture(),raw=f.map.get(f.a.globalVault),b=Buffer.from(raw.data[0],'base64');b[32]^=1;raw.data=[b.toString('base64'),'base64'];
 await assert.rejects(()=>readPhoenixCollateralContext({walletAddress:f.wallet},f.options),/VAULT/);
 await assert.rejects(()=>readPhoenixCollateralContext({walletAddress:f.wallet},{...f.options,request:async()=> 'testnet'}),/NETWORK/);
});

test('already queued withdrawal offers only a wait state, never a second payout instruction',async()=>{
 const f=await fixture({queued:true});
 const p=await preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1},{request:f.request});
 assert.equal(p.phase,'WAIT');assert.equal(p.walletCredited,false);assert.equal(p.instructions.length,0);
 assert.throws(()=>buildPhoenixCollateralWire(p,f.wireOptions),/UNVERIFIED/);
});

async function simulated(phase='WITHDRAW',{queue=false}={}){
 const f=await fixture({canonical:phase==='UNWRAP'?10010001n:0n,collateral:phase==='UNWRAP'?0n:10010000n});
 const p=await preparePhoenixCollateral({context:f.context,account:f.account,subaccountIndex:1,phase,...(phase==='UNWRAP'?{amountUnits:'10010000'}:{})},{request:f.request});
 const wire=buildPhoenixCollateralWire(p,f.wireOptions);let mutate=null;
 f.setRpc(async(method,params)=>{
  if(method==='getFeeForMessage'){assert.equal(params[0],wire.messageBase64);return {context:{slot:1000},value:5300};}
  if(method!=='simulateTransaction')return undefined;
  assert.equal(params[0],wire.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);
  const child=phoenixTraderBytes({address:f.a.trader,collateral:queue?10010000n:0n});if(queue)child.writeUInt32LE(1,108);
  const posts=[phoenixRpcAccount('11111111111111111111111111111111',Buffer.alloc(0),99994700),
   phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.usdc,f.wallet,phase==='UNWRAP'?13010000n:3000000n)),
   phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,f.wallet,phase==='UNWRAP'?1n:queue?0n:10010000n)),phoenixRpcAccount(ID.program,child)];
  mutate?.(posts);return {context:{slot:1000},value:{err:null,unitsConsumed:50000,accounts:posts}};
 });
 return {...f,p,wire,mutate(fn){mutate=fn;}};
}
test('same-wire payout simulation conserves quote/token balances and does not claim finality',async()=>{
 for(const phase of ['WITHDRAW','UNWRAP']){
  const f=await simulated(phase),s=await simulatePhoenixCollateral(f.wire,{request:f.request});
  assert.equal(s.phase,phase);assert.equal(s.walletCredited,false);assert.equal(s.readyForSigning,false);
  assert.equal(s.amountUnits,'10010000');assert.equal(s.rentLockedLamports,'0');
  assert.equal(requirePhoenixCollateralSimulation(s,{wire:f.wire,request:f.request}).wire,f.wire);
  assert.throws(()=>requirePhoenixCollateralSimulation({...s},{wire:f.wire}),/UNVERIFIED/);
 }
 const q=await simulated('WITHDRAW',{queue:true}),s=await simulatePhoenixCollateral(q.wire,{request:q.request});
 assert.equal(s.payoutQueued,true);assert.equal(s.walletCredited,false);
});
test('wrong token destination effects, lost payout, standing delegate and hidden SOL loss reject',async()=>{
 for(const mutate of [posts=>{const b=Buffer.from(posts[2].data[0],'base64');b.writeBigUInt64LE(0n,64);posts[2].data[0]=b.toString('base64');},
  posts=>{const b=Buffer.from(posts[2].data[0],'base64');b.writeUInt32LE(1,72);b.fill(2,76,108);posts[2].data[0]=b.toString('base64');},
  posts=>{posts[0].lamports-=1;},posts=>{const b=Buffer.from(posts[1].data[0],'base64');b[32]^=1;posts[1].data[0]=b.toString('base64');}]){
  const f=await simulated();f.mutate(mutate);await assert.rejects(()=>simulatePhoenixCollateral(f.wire,{request:f.request}));
 }
});
