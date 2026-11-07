import test from 'node:test';
import assert from 'node:assert/strict';
import {createClosedPerpsUsdBoundsReader,createHistoricalClosedPerpsUsdBoundsReader} from '../lib/perps-closed-usd-bounds.js';
const clock=Date.parse('2026-10-20T20:06:00Z'),day='2026-10-20',minute=Date.parse(day+'T20:00:00Z')/1000;
const symbols={USDCUSD:'USDC',XBTUSD:'BTC',ETHUSD:'ETH',SOLUSD:'SOL'};
function fixture(mode='ok',historical=false){
 const calls=[];let elapsed=0;
 const fetchImpl=async(url,options)=>{
  const u=new URL(url),asset=symbols[u.searchParams.get('pair')],interval=Number(u.searchParams.get('interval')),start=Number(u.searchParams.get('since'));
  calls.push({asset,interval});assert.equal(u.origin,'https://api.kraken.com');assert.equal(u.pathname,'/0/public/OHLC');
  assert.equal(u.searchParams.get('assetVersion'),'1');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const low=asset==='USDC'?'0.99':'99',high=asset==='USDC'?'1.01':'101',mid=asset==='USDC'?'1':'100';
  const row=time=>[time,mid,high,low,mid,mid,'1',1];
  const rows=[row(start),row(Math.floor(clock/1000/(interval*60))*interval*60)];
  if(mode==='missing-minute'&&interval===1)rows[0][0]-=60;
  if(mode==='open-only')rows.splice(0,1);
  if(mode==='zero-trade'){rows[0][5]='0';rows[0][6]='0';rows[0][7]=0;}
  if(mode==='zero-mismatch')rows[0][7]=0;
  if(mode==='price')rows[0][2]='-1';if(mode==='range')rows[0][3]=asset==='USDC'?'2':'102';
  if(mode==='duplicate')rows[1]=structuredClone(rows[0]);
  if(mode==='expired')elapsed=10001;
  const body={error:[],result:{[mode==='pair'?'OTHER/USD':asset+'/USD']:rows,last:clock/1000}};
  if(mode==='error')body.error=['EGeneral:Unavailable'];if(mode==='last')body.result.last='not-a-number';
  const response=Response.json(body);
  if(mode==='oversize')response.headers.set('content-length','262145');
  if(mode==='content-type')response.headers.set('content-type','text/html');
  return response;
 };
 return {calls,read:(historical?createHistoricalClosedPerpsUsdBoundsReader:createClosedPerpsUsdBoundsReader)({fetchImpl,now:()=>clock,monotonicNow:()=>elapsed})};
}

test('explicit historical audit keeps actual wall-clock freshness and transaction-day closed bounds',async()=>{
 const previous='2026-10-19',time=Date.parse(previous+'T23:12:20Z')/1000,requests=[{asset:'USDC',blockTime:time}];
 const f=fixture('ok',true),result=await f.read({requests,day:previous});
 const bar=result.get('USDC:'+Math.floor(time/60)*60);
 assert.equal(new Date(bar.start*1000).toISOString().slice(0,10),previous);
 assert.equal(bar.timeframeSeconds,300);assert.equal(bar.lowE8,'99000000');assert.equal(bar.highE8,'101000000');
 assert.deepEqual(f.calls,[{asset:'USDC',interval:5}]);
 await assert.rejects(()=>fixture().read({requests,day:previous}));
 for(const mode of ['open-only','zero-trade','expired'])await assert.rejects(()=>fixture(mode,true).read({requests,day:previous}));
 for(const invalid of ['2026-10-21','2026-02-30','2026-1-1'])await assert.rejects(()=>f.read({requests:[],day:invalid}));
 await assert.rejects(()=>f.read({requests,day}));
});

test('historical audit cannot survive a wall-clock day rollover or backwards clock',async()=>{
 const previous='2026-10-19',time=Date.parse(previous+'T23:12:20Z')/1000;
 for(const moved of [Date.parse('2026-10-21T00:00:00Z'),clock-1]){
  let current=clock;
  const read=createHistoricalClosedPerpsUsdBoundsReader({now:()=>current,monotonicNow:()=>0,fetchImpl:async()=>{
   current=moved;return Response.json({error:[],result:{'USDC/USD':[[Math.floor(time/300)*300,'1','1.01','0.99','1','1','1',1],[Math.floor(clock/300000)*300,'1','1.01','0.99','1','1','1',1]],last:clock/1000}});
  }});
  await assert.rejects(()=>read({requests:[{asset:'USDC',blockTime:time}],day:previous}));
 }
});
test('closed direct USD bars bind each fixed market and preserve decimal USDC bounds without a peg',async()=>{
 const f=fixture(),requests=['USDC','BTC','ETH','SOL'].map(asset=>({asset,blockTime:minute+20}));
 const result=await f.read({requests,day});assert.equal(f.calls.length,4);
 assert.equal(result.get('USDC:'+minute).lowE8,'99000000');assert.equal(result.get('USDC:'+minute).highE8,'101000000');
 assert.equal(result.get('BTC:'+minute).lowE8,'9900000000');assert.equal(result.get('ETH:'+minute).timeframeSeconds,60);
 assert(Object.isFrozen(result.get('SOL:'+minute)));await f.read({requests,day});assert.equal(f.calls.length,4);
});
test('old same-day history uses retained five-minute bars and a missing minute has one bounded fallback',async()=>{
 const old=fixture(),time=Date.parse(day+'T00:12:00Z')/1000;
 const oldResult=await old.read({requests:[{asset:'USDC',blockTime:time}],day});
 assert.deepEqual(old.calls,[{asset:'USDC',interval:5}]);assert.equal(oldResult.get('USDC:'+Math.floor(time/60)*60).timeframeSeconds,300);
 const f=fixture('missing-minute'),result=await f.read({requests:[{asset:'BTC',blockTime:minute}],day});
 assert.deepEqual(f.calls,[{asset:'BTC',interval:1},{asset:'BTC',interval:5}]);assert.equal(result.get('BTC:'+minute).timeframeSeconds,300);
});
test('partial, absent, zero-trade, malformed, foreign-pair and expired market data cannot become a zero-cost bound',async()=>{
 for(const mode of ['open-only','zero-trade','zero-mismatch','price','range','duplicate','expired','pair','error','last','oversize','content-type']){
  const f=fixture(mode);await assert.rejects(()=>f.read({requests:[{asset:'USDC',blockTime:minute}],day}),mode);
 }
 const f=fixture();await assert.rejects(()=>f.read({requests:[{asset:'USDC',blockTime:clock/1000}],day}));
 await assert.rejects(()=>f.read({requests:[{asset:'BNB',blockTime:minute}],day}));
 await assert.rejects(()=>f.read({requests:[{asset:'USDC',blockTime:minute}],day:'2026-10-19'}));
});
