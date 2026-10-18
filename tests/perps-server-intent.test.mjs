import test from 'node:test';
import assert from 'node:assert/strict';
import {checkServerPerpsCoreIntent} from '../lib/perps-server-intent.js';
const now=1802865600;
const intent={asset:'SOL',side:'LONG',marginUsd:'10',leverage:'3',maxSlippageBps:50,referencePrice:'100',stopLoss:'95',takeProfit:'110'};
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const open=(patch={})=>{
 const v={size:30000000,collateral:10000000,side:1,price:100500000,time:now,...patch};
 return Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(v.size),Buffer.from([1]),u64(v.collateral),Buffer.from([v.side]),u64(v.price),u64(v.time)]).toString('base64');
};
const exit=(profit,patch={})=>{
 const v={size:30000000,collateral:0,price:profit?110000000:95000000,above:profit?1:0,entire:0,time:now,...patch};
 return Buffer.concat([Buffer.from('7562427f1e3249b9','hex'),u64(v.collateral),u64(v.size),u64(v.price),Buffer.from([v.above,v.entire]),u64(1),u64(v.time)]).toString('base64');
};
test('server binds both exit levels and new exposure using exact micro-USD, without signing approval',()=>{
 const result=checkServerPerpsCoreIntent([open(),exit(false),exit(true)],intent,now);
 assert.deepEqual(result,{stage:'CORE_INTENT_ONLY',readyForSigning:false,sizeUsdUnits:'30000000',side:'LONG',exitCount:2});
 const short={...intent,side:'SHORT',stopLoss:'105',takeProfit:'90'};
 assert.equal(checkServerPerpsCoreIntent([open({side:2,price:99500000}),exit(false,{price:105000000,above:1}),exit(true,{price:90000000,above:0})],short,now).side,'SHORT');
});
test('rejects size or price overage of one micro-unit, stale requests and changed direction',()=>{
 for(const patch of [{size:30000001},{price:100500001},{time:now-31},{time:now+3},{side:2}]){
  assert.throws(()=>checkServerPerpsCoreIntent([open(patch),exit(false),exit(true)],intent,now));
 }
});
test('rejects missing, duplicated, whole-position or mismatched-size exits',()=>{
 for(const items of [[open()],[open(),exit(false)],[open(),exit(false),exit(false)],
  [open(),exit(false,{entire:1}),exit(true)],[open(),exit(false,{size:30000001}),exit(true)],
  [open(),exit(false,{collateral:1}),exit(true)],[open(),exit(false,{price:95000001}),exit(true)]]){
  assert.throws(()=>checkServerPerpsCoreIntent(items,intent,now));
 }
});
test('no exits is valid only when explicitly absent; malformed encoding and unsafe sizing fail',()=>{
 const noExits={...intent,stopLoss:null,takeProfit:null};
 assert.equal(checkServerPerpsCoreIntent([open()],noExits,now).exitCount,0);
 for(const patch of [{marginUsd:'9.999999'},{leverage:'3.01'},{leverage:'50.1'},{maxSlippageBps:101},{referencePrice:'1e2'},{asset:'XRP'}]){
  assert.throws(()=>checkServerPerpsCoreIntent([open()],{...noExits,...patch},now));
 }
 for(const bad of [open()+'\n','AA==','',Buffer.alloc(65).toString('base64')])assert.throws(()=>checkServerPerpsCoreIntent([bad],noExits,now));
});
