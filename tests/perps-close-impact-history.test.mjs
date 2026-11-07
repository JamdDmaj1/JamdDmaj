import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPerpsCloseImpactHistory as check,checkPerpsCloseCustodyTail as tail} from '../lib/perps-close-impact-history.js';
function fixture({old=119,time=121,side='SHORT',size=30000000n}={}){
 const a=Buffer.alloc(1117),b=Buffer.alloc(1117);
 for(let i=0;i<60;i++)a.writeBigInt64LE(BigInt(i+1),416+8*i);
 a.writeBigInt64LE(BigInt(old),896);a.copy(b);b.writeBigInt64LE(BigInt(time),896);
 // Independent per-bucket age model, not the implementation's clearing loop.
 for(let i=0;i<60;i++){
  const age=(time-i+60)%60;
  let n=old===0||time-old>=60||age<time-old?0n:a.readBigInt64LE(416+8*i);
  if(i===time%60)n=(old!==0&&time===old?a.readBigInt64LE(416+8*i):0n)+(side==='SHORT'?size:-size);
  b.writeBigInt64LE(n,416+8*i);
 }
 return {a,b,options:{sizeUsdUnits:String(size),requestTimeSeconds:String(time-5),nowSeconds:time,isMarket:true,side}};
}
test('exact close history across both directions, same second, rollover, full expiry and uninitialized clock',()=>{
 for(const side of ['LONG','SHORT'])for(const [old,time]of [[119,119],[119,120],[119,121],[120,179],[120,180],[120,181],[0,120]]){
  const f=fixture({old,time,side});assert.doesNotThrow(()=>check(f.a,f.b,f.options),side+' '+old+'/'+time);
 }
});
test('each bucket is checked: wrong amount/sign, retained expired or changed unrelated history is refused',()=>{
 for(let i=0;i<60;i++){
  const f=fixture();f.b.writeBigInt64LE(f.b.readBigInt64LE(416+8*i)+1n,416+8*i);assert.throws(()=>check(f.a,f.b,f.options));
 }
 const f=fixture();assert.throws(()=>check(f.a,f.b,{...f.options,side:'LONG'}));
 assert.throws(()=>check(f.a,f.b,{...f.options,sizeUsdUnits:'30000001'}));
 assert.throws(()=>check(f.a,f.b,{...f.options,isMarket:false}));
});
test('all immutable prefix/configuration/extension bytes remain exact',()=>{
 for(const offset of [...Array.from({length:130},(_,i)=>286+i),...Array.from({length:213},(_,i)=>904+i)]){
  const f=fixture();f.b[offset]^=1;assert.throws(()=>check(f.a,f.b,f.options),'offset '+offset);
 }
});
test('clock bounds, canonical integers, signed overflow, truncation and unsupported context fail closed',()=>{
 for(const patch of [{nowSeconds:118},{nowSeconds:152},{requestTimeSeconds:'200'},{requestTimeSeconds:'1'},{sizeUsdUnits:'0'},{sizeUsdUnits:'-1'},{sizeUsdUnits:'3.0'},{sizeUsdUnits:'9223372036854775808'},{side:'OTHER'},{nowSeconds:NaN}]){
  const f=fixture();assert.throws(()=>check(f.a,f.b,{...f.options,...patch}));
 }
 const f=fixture();f.a.writeBigInt64LE(122n,896);assert.throws(()=>check(f.a,f.b,f.options));
 assert.throws(()=>check(f.a.subarray(0,900),f.b.subarray(0,900),f.options));
 const overflow=fixture({old:119,time:119});overflow.a.writeBigInt64LE(9223372036854775807n,416+8*59);assert.throws(()=>check(overflow.a,overflow.b,overflow.options));
});
test('unchanged historical tail is compatible but cannot authorize an account or transaction',()=>{
 const a=Buffer.alloc(416);assert.equal(check(a,Buffer.from(a),{}),undefined);
 const f=fixture();assert.equal(check(f.a,Buffer.from(f.a),{isMarket:false}),undefined);
});
test('history and borrow accrual compose without exempting configuration or unexplained debt',()=>{
 function accrued(market=true){const f=fixture();if(!market)f.b=Buffer.from(f.a);
  f.a.writeBigUInt64LE(100n,972);f.a.writeBigInt64LE(118n,988);f.a.writeBigUInt64LE(1000n,1004);f.a.writeBigUInt64LE(20n,1020);
  f.b.writeBigUInt64LE(102n,972);f.b.writeBigInt64LE(121n,988);f.b.writeBigUInt64LE(1010n,1004);f.b.writeBigUInt64LE(30n,1020);
  f.options.isMarket=market;return f;}
 for(const market of [true,false]){const f=accrued(market);assert.doesNotThrow(()=>tail(f.a,f.b,f.options));}
 for(const offset of [286,415,904,912,916,932,971,996,1003,1036,1116]){const f=accrued();f.b[offset]^=1;assert.throws(()=>tail(f.a,f.b,f.options),'offset '+offset);}
 for(const change of [f=>f.b.writeBigUInt64LE(1011n,1004),f=>f.b.writeBigUInt64LE(999n,1004),f=>f.b.writeBigInt64LE(117n,988),f=>f.b.writeBigUInt64LE(99n,972),f=>f.b.writeBigUInt64LE(31n,1020)]){const f=accrued();change(f);assert.throws(()=>tail(f.a,f.b,f.options));}
 const f=accrued();f.b.writeBigInt64LE(f.b.readBigInt64LE(416)+1n,416);assert.throws(()=>tail(f.a,f.b,f.options));
});
