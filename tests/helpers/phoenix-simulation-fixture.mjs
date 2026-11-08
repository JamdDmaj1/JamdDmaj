import assert from 'node:assert/strict';
import {preparePhoenixOrderReview,preparePhoenixCloseReview} from '../../lib/phoenix-order-review.js';
import {readPhoenixChainAccount} from '../../lib/phoenix-chain-account.js';
import {readPhoenixNativeMarket} from '../../lib/phoenix-native-market.js';
import {buildPhoenixOrderWire} from '../../lib/phoenix-order-wire.js';
import {PHOENIX_IDENTITIES as ID} from '../../lib/phoenix-market-plan.js';
import {phoenixNativeMarketFixture} from './phoenix-native-market-fixture.mjs';
import {phoenixRpcAccount,phoenixTokenBytes,phoenixTraderBytes} from './phoenix-chain-account-fixture.mjs';
import {phoenixEventBatches} from './phoenix-event-batches.mjs';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM='11111111111111111111111111111111';
export async function phoenixSimulationFixture({close=false,side='LONG',canonicalExists=false,closedCollateral=10010000n}={}){
 const f=await phoenixNativeMarketFixture(),map=new Map([...f.nativeMap,...f.map]);
 const parent=map.get(f.parent),parentBytes=Buffer.from(parent.data[0],'base64');parentBytes.writeUInt32LE(1,116);parent.data=[parentBytes.toString('base64'),'base64'];
 const beforeCash=close?3000000n:20000000n;
 map.set(f.a.usdcAta,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.usdc,f.wallet,beforeCash)));
 map.set(f.a.trader,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.a.trader,
  baseLots:close?-240n:0n,virtualQuoteLots:close?30000000n:0n,collateral:close?10000000n:0n})));
 if(canonicalExists)map.set(f.a.canonicalAta,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,f.wallet,0n)));
 let wire,review,postOverride=null,eventOverride=null,simulationError=null,slot=1000,fee=5600;
 const calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts')return {context:{slot},value:params[0].map(address=>{
   const a=map.get(address);if(!a)return null;const slice=params[1].dataSlice;
   return slice?{...a,data:[Buffer.from(a.data[0],'base64').subarray(slice.offset,slice.offset+slice.length).toString('base64'),'base64']}:a;
  })};
  if(method==='getFeeForMessage'){assert.equal(params[0],wire.messageBase64);return {context:{slot},value:fee};}
  if(method==='simulateTransaction'){
   assert.equal(params[0],wire.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].sigVerify,false);
   const plan=review.plan,lots=BigInt(plan.baseLots),quote=lots*123456n,protocolFee=(quote*350n+999999n)/1000000n;
   const rent=close||canonicalExists?0n:2039280n;
   const post=[phoenixRpcAccount(SYSTEM,Buffer.alloc(0),Number(100000000n-BigInt(fee)-rent)),
    phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.usdc,f.wallet,beforeCash-BigInt(plan.marginUsdcUnits))),
    close&&!canonicalExists?null:phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,f.wallet,0n)),
    phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.a.trader,baseLots:close?0n:side==='LONG'?lots:-lots,
     virtualQuoteLots:close?0n:side==='LONG'?-quote:quote,collateral:close?closedCollateral:10000000n-protocolFee}))];
   postOverride?.(post);
   let innerInstructions=phoenixEventBatches({wire,plan,traderAddress:f.a.trader,slot,timestamp:Math.floor(f.now()/1000),quote,fee:protocolFee,
    postBase:close?0n:side==='LONG'?lots:-lots,postVirtual:close?0n:side==='LONG'?-quote:quote,postCollateral:close?closedCollateral:10000000n-protocolFee});
   if(eventOverride)innerInstructions=eventOverride(innerInstructions);
   return {context:{slot},value:{err:simulationError,unitsConsumed:120000,accounts:post,innerInstructions}};
  }
  throw Error('UNEXPECTED_SIMULATION_RPC');
 };
 const deps={...f.deps,readAccount:args=>readPhoenixChainAccount(args,{request,now:f.now,monotonicNow:f.monotonicNow})};
 review=close?await preparePhoenixCloseReview(f.intent,deps):await preparePhoenixOrderReview({...f.intent,side},deps);
 const account=review.account??await deps.readAccount({walletAddress:f.wallet,subaccountIndices:[1]});
 const native=await readPhoenixNativeMarket(review.plan,{...f.nativeOptions,request});
 wire=await buildPhoenixOrderWire(review,f.wireOptions);
 return {...f,map,request,calls,wire,review,account,native,
  args:{wire,account,native},simulationOptions:{request,now:f.now,monotonicNow:f.monotonicNow},
  overridePost(fn){postOverride=fn;},overrideEvents(fn){eventOverride=fn;},setError(value){simulationError=value;},setFee(value){fee=value;},setSlot(value){slot=value;}};
}
