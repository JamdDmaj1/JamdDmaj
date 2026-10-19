import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readIndexedServerPerpsDay} from '../lib/perps-server-history.js';
import {PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),now=Date.parse('2026-10-18T12:00:00Z');
async function fixture(){
 const position=(await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'})).position;
 const rows=[1,2].map(n=>({owner:wallet,action:n===1?'Increase':'Decrease',side:'long',createdTime:now/1000-n,mint:PERPS_CUSTODIES.SOL.mint,positionPubkey:position,txHash:bs58.encode(Buffer.alloc(64,n)),pnl:n===1?'0':'-1.234567',fee:'0.01',collateralUsdDelta:'10.00'}));
 const calls=[],fetchImpl=async(url,options)=>{const u=new URL(url);calls.push({u,options});const start=Number(u.searchParams.get('start')),end=Number(u.searchParams.get('end'));return Response.json({count:rows.length,dataList:rows.slice(start,end)});};
 return {rows,calls,fetchImpl};
}
test('daily indexed history follows all pages, binds owner/position and preserves exact dollars without granting risk credit',async()=>{
 const f=await fixture(),result=await readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-10-18'},{fetchImpl:f.fetchImpl,now:()=>now,pageSize:1});
 assert.equal(result.indexedCount,2);assert.equal(result.rows[1].indexedPnlUsdUnits,'-1234567');assert.equal(result.rows[0].indexedFeeUsdUnits,'10000');
 assert.equal(result.requiresChainReconciliation,true);assert.equal(result.lossTodayUsdcUnits,null);assert.equal(result.tradesToday,null);assert.equal(result.readyForSigning,false);
 assert.ok(Object.isFrozen(result.rows[0]));assert.deepEqual(f.calls.map(c=>c.u.searchParams.get('start')),['0','1','0']);assert.ok(f.calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'));
});
test('duplicates, changing page counts and truncated history never become complete-looking results',async()=>{
 const f=await fixture();
 for(const transform of [
  (_v,n)=>n===2?{count:3,dataList:[f.rows[1]]}:_v,
  (v,n)=>n===2?{...v,dataList:[f.rows[0]]}:v,
  v=>({...v,dataList:[]}),v=>({...v,count:501}),
  (v,n)=>n===3?{...v,dataList:[{...f.rows[0],fee:'0.02'}]}:v,
 ]){
  let count=0;await assert.rejects(readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-10-18'},{pageSize:1,now:()=>now,fetchImpl:async(u,o)=>{const r=await f.fetchImpl(u,o);return Response.json(transform(await r.json(),++count));}}));
 }
});
test('wrong wallet, day, mint, signature, position, decimal precision and missing fee are rejected',async()=>{
 for(const change of [{owner:bs58.encode(Buffer.alloc(32,9))},{mint:wallet},{positionPubkey:wallet},{createdTime:now/1000+10},{txHash:wallet},{pnl:'NaN'},{pnl:'-1.2345678'},{fee:undefined},{fee:'-1'}]){
  const f=await fixture();Object.assign(f.rows[0],change);await assert.rejects(readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-10-18'},{now:()=>now,fetchImpl:f.fetchImpl}));
 }
 const f=await fixture();await assert.rejects(readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-02-30'},{now:()=>now,fetchImpl:f.fetchImpl}));
});
test('an empty index stays explicitly unverified and transport failures are not replaced with zero loss',async()=>{
 const result=await readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-10-18'},{now:()=>now,fetchImpl:async()=>Response.json({count:0,dataList:[]})});assert.equal(result.indexedCount,0);assert.equal(result.lossTodayUsdcUnits,null);
 await assert.rejects(readIndexedServerPerpsDay({walletAddress:wallet,day:'2026-10-18'},{now:()=>now,fetchImpl:async()=>new Response('unavailable',{status:503})}));
});
