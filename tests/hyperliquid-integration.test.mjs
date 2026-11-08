import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeHyperliquidMarkets,decodeHyperliquidAccount,createHyperliquidPublicClient,hlDecimal} from '../lib/hyperliquid-public.js';
import {planHyperliquidOrder} from '../lib/hyperliquid-order-plan.js';
import {createHyperliquidTestnetExecutor} from '../lib/hyperliquid-testnet-executor.js';
const now=1800000000000,user='0x1111111111111111111111111111111111111111',cloid='0x'+'12'.repeat(16);
const raw=[[{name:'OLD',szDecimals:0,maxLeverage:2,isDelisted:true},{name:'DOGE',szDecimals:0,maxLeverage:20}].reduce((v,m)=>(v.universe.push(m),v),{universe:[]}),[{markPx:'1'},{markPx:'0.12345'}]];
const state={marginSummary:{accountValue:'100',totalMarginUsed:'0'},withdrawable:'100',assetPositions:[]};
const catalog=network=>decodeHyperliquidMarkets(raw,{network,observedAt:now});
const account=(network='testnet',value=state)=>decodeHyperliquidAccount(value,[],user,{network,observedAt:now});
const plan=(overrides={})=>planHyperliquidOrder({catalog:catalog('testnet'),account:account(),symbol:'DOGE',side:'LONG',margin:'10',leverage:3,cloid,now,...overrides});
test('venue catalog keeps original asset IDs across delistings and cannot silently map token symbols',()=>{
 const value=catalog('mainnet');assert.equal(value.markets[1].assetId,1);assert.equal(value.markets[0].delisted,true);assert.equal(value.markets[1].symbol,'DOGE');
 assert.throws(()=>decodeHyperliquidMarkets([{universe:[...raw[0].universe,raw[0].universe[1]]},[...raw[1],raw[1][1]]]),/invalid-market/);
 assert.throws(()=>decodeHyperliquidMarkets([raw[0],[]]),/invalid-catalog/);
 assert.throws(()=>plan({symbol:'PEPE'}),/market-unavailable/);assert.throws(()=>plan({symbol:'OLD'}),/market-unavailable/);
});
test('read-only client uses only fixed info origins and bounded public request types',async()=>{
 const calls=[],client=createHyperliquidPublicClient({network:'mainnet',now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return {ok:true,text:async()=>JSON.stringify(JSON.parse(options.body).type==='metaAndAssetCtxs'?raw:JSON.parse(options.body).type==='openOrders'?[]:state)};}});
 await client.markets();const value=await client.account(user);assert.equal(value.accountValue,'100');assert.equal(value.venue,'hyperliquid');assert.deepEqual(calls.map(c=>c.body.type),['metaAndAssetCtxs','clearinghouseState','openOrders']);assert.ok(calls.every(c=>c.url==='https://api.hyperliquid.xyz/info'&&c.options.credentials==='omit'));
 assert.throws(()=>createHyperliquidPublicClient({network:'evil'}),/network/);await assert.rejects(()=>client.account('solanaWallet'),/account/);
});
test('exact IOC prices tighten 0.5%, lot sizes floor and cross-venue/stale/overbudget reviews fail',()=>{
 for(const side of ['LONG','SHORT']){const value=plan({side}),px=hlDecimal(value.order.p),mark=hlDecimal(value.markPx);assert.equal(value.order.a,1);assert.equal(value.order.t.limit.tif,'Ioc');assert.equal(value.order.r,false);assert.equal(value.order.c,cloid);assert.ok(side==='LONG'?px*10000n<=mark*10050n:px*10000n>=mark*9950n);assert.match(value.order.s,/^\d+$/);}
 assert.throws(()=>plan({catalog:catalog('mainnet')}),/expired/);assert.throws(()=>plan({now:now+16000}),/expired/);assert.throws(()=>plan({margin:'101'}),/margin/);assert.throws(()=>plan({leverage:21}),/leverage/);
});
test('close reverses direction reduce-only and never assumes small collateral means no position',()=>{
 const position={coin:'DOGE',szi:'-240',entryPx:'0.12',marginUsed:'9',unrealizedPnl:'-0.5',returnOnEquity:'-0.055',leverage:{type:'isolated',value:3}};
 const value=plan({account:account('testnet',{...state,assetPositions:[{position}]}),close:true});assert.equal(value.order.b,true);assert.equal(value.order.r,true);assert.equal(value.order.s,'240');
 assert.throws(()=>plan({account:account('testnet',{...state,assetPositions:[{position}]})}),/existing-exposure/);
});
function harness({networkFailure=false,onSign=()=>{}}={}){const listeners={},records=new Map(),calls=[];const provider={on:(event,fn)=>listeners[event]=fn,removeListener:()=>{},async request(packet){calls.push(packet.method);if(packet.method==='eth_accounts')return [user];if(packet.method==='eth_signTypedData_v4'){onSign(listeners);return '0x'+'11'.repeat(64)+'1b';}throw Error('unexpected-wallet-call');}};
 const executor=createHyperliquidTestnetExecutor({provider,user,now:()=>now,validatePlan:async()=>true,journal:{get:async key=>records.get(key),put:async(key,v)=>records.set(key,v)},lock:async(_key,fn)=>fn(),request:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(networkFailure)throw Error('offline');return {ok:true,json:async()=>({status:'ok',response:{type:'order',data:{statuses:[{filled:{totalSz:'240',avgPx:'0.123',oid:123}}]}}})};}});return {executor,records,calls};}
test('actual SDK signs testnet-only IOC once; response stays check-required and journal prevents repeat',async()=>{
 const {executor,records,calls}=harness();const value=plan();const result=await executor.submit(value,{confirmed:true});assert.equal(result.stage,'CHECK_REQUIRED');assert.equal(records.get(user).phase,'CHECK_REQUIRED');const sent=calls.find(c=>c.url);assert.equal(sent.url,'https://api.hyperliquid-testnet.xyz/exchange');assert.equal(sent.body.action.orders[0].t.limit.tif,'Ioc');assert.equal(sent.body.expiresAfter,value.expiresAt);await assert.rejects(()=>executor.submit(value,{confirmed:true}),/pending/);assert.equal(calls.filter(c=>c.url).length,1);executor.dispose();
});
test('mainnet, missing confirmation, wallet changes during signature and uncertain submissions fail closed',async()=>{
 const h=harness();await assert.rejects(()=>h.executor.submit({...plan(),network:'mainnet'},{confirmed:true}),/testnet-only/);await assert.rejects(()=>h.executor.submit(plan()),/review-required/);assert.equal(h.calls.length,0);
 const changed=harness({onSign:listeners=>listeners.accountsChanged()});await assert.rejects(()=>changed.executor.submit(plan(),{confirmed:true}));assert.equal(changed.calls.filter(c=>c.url).length,0);assert.equal(changed.records.get(user).phase,'NOT_SUBMITTED');
 const uncertain=harness({networkFailure:true});await assert.rejects(()=>uncertain.executor.submit(plan(),{confirmed:true}));assert.equal(uncertain.records.get(user).phase,'UNCERTAIN');await assert.rejects(()=>uncertain.executor.submit(plan(),{confirmed:true}),/pending/);assert.equal(uncertain.calls.filter(c=>c.url).length,1);
});
