import test from 'node:test';
import assert from 'node:assert/strict';
import {manualTerminalService} from '../lib/manual-terminal-service.js';
import {terminalSignalDecision} from '../scripts/bitget-executor.mjs';
const id='12345678-1234-4123-8123-123456789abc';
const draft={symbol:'BTCUSDT',side:'LONG',margin:5,leverage:3,reference:100,stop:90,take:110};
function fixture(){
 let time=Date.now();const store=new Map();let queued=0;
 const state={config:{livePaused:false},executor:{mode:'live',ok:true,bitgetSynced:true,entrySource:'manual-only',manualOrderVersion:1,terminalOrderVersion:1,marginMode:'isolated',productType:'USDT-FUTURES',livePaused:false,receivedAt:new Date(time).toISOString(),accountRisk:{updatedAt:new Date(time).toISOString(),available:20}}};
 const quote={symbol:'BTCUSDT',price:100,timestamp:time,minLeverage:'1',maxLeverage:'10',minNotional:'5',minQuantity:'.01',quantityStep:'.01'};
 const redis=async(path,[command])=>{
  const [op,...args]=command;
  if(op==='SET'){if(store.has(args[0]))return [{result:null}];store.set(args[0],args[1]);return [{result:'OK'}];}
  if(op==='GET')return [{result:store.get(args[0])??null}];
  if(op==='EVAL'){
   const dedup=args[2],queue=args[3],payload=args[4];
   if(store.has(dedup))return [{result:'duplicate'}];if(store.has(queue))return [{result:'busy'}];
   store.set(dedup,true);store.set(queue,payload);queued++;return [{result:'queued'}];
  }
  throw Error('Unexpected command');
 };
 const deps={redis,getState:async()=>state,getQuote:async()=>quote,enabled:true,now:()=>time,newId:()=>id};
 return {deps,state,quote,store,advance:()=>{time+=61000;},queued:()=>queued};
}
test('prepare, explicit confirm and duplicate protection use the exact saved draft',async()=>{
 const f=fixture(),service=manualTerminalService(f.deps);
 const review=await service.prepare(draft);assert.equal(review.submitted,false);assert.equal(f.queued(),0);
 const result=await service.confirm({requestId:id,confirmLiveOrder:true,draft:{...draft,margin:25}});
 assert.equal(result.status,'queued');assert.equal(result.filled,false);assert.equal(f.queued(),1);
 const payload=JSON.parse(f.store.get('jamd:pro:executor:manual-test'));
 assert.equal(payload.signal.plannedUsd,5);assert.equal(payload.signal.terminalOrderVersion,1);
 await assert.rejects(()=>service.confirm({requestId:id,confirmLiveOrder:true}));assert.equal(f.queued(),1);
 assert.equal(terminalSignalDecision(payload.signal,{entrySource:'manual-only',marginMode:'isolated',productType:'USDT-FUTURES',marginCoin:'USDT'}).ok,true);
});
test('disabled deployment, pause, expiry and price changes prevent queue writes',async()=>{
 const disabled=fixture();await assert.rejects(()=>manualTerminalService({...disabled.deps,enabled:false}).prepare(draft));assert.equal(disabled.queued(),0);
 for(const mutate of [f=>{f.state.config.livePaused=true;},f=>f.advance(),f=>{f.quote.price=102;}]){
  const f=fixture(),service=manualTerminalService(f.deps);await service.prepare(draft);mutate(f);
  await assert.rejects(()=>service.confirm({requestId:id,confirmLiveOrder:true}));assert.equal(f.queued(),0);
 }
});
test('missing consent or incompatible executor cannot submit',async()=>{
 const f=fixture(),service=manualTerminalService(f.deps);await service.prepare(draft);
 await assert.rejects(()=>service.confirm({requestId:id}));f.state.executor.terminalOrderVersion=0;
 await assert.rejects(()=>service.confirm({requestId:id,confirmLiveOrder:true}));assert.equal(f.queued(),0);
});
