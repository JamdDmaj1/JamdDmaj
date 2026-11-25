// Standalone read/simulation only: no vault, journal, executor or signing imports.
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {prepareSimulatedServerPerpsFullClose} from '../lib/perps-server-close-preparation.js';
import {readPerpsMarketReference} from '../lib/perps-market-reference.js';
import {checkPerpsCloseImpactHistory} from '../lib/perps-close-impact-history.js';
import bs58 from 'bs58';
const pid=process.argv[2];if(!/^[1-9][0-9]*$/.test(pid||''))throw Error('PID_REQUIRED');
if(!readFileSync('/proc/'+pid+'/cmdline','utf8').includes('/opt/jamddmaj-perps/worker/perps-server-worker.mjs'))throw Error('WORKER_IDENTITY_REQUIRED');
const entry=readFileSync('/proc/'+pid+'/environ','utf8').split('\0').find(s=>s.startsWith('JAMDDMAJ_PERPS_RPC_URL='));
// Diagnostic-only batching: preserve both read methods, commitments, IDs and
// exact-bank checks. Outer transport still paces/counts each logical request.
let waitingPair;
const rpcFetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 if(body.method==='getMultipleAccounts'&&body.params[0].length>10){
  if(waitingPair)throw Error('DIAGNOSTIC_PAIR_BUSY');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waitingPair=null;reject(Error('DIAGNOSTIC_PAIR_MISSING'));},1000);waitingPair={url,options,body,resolve,reject,timer};});
 }
 if(body.method==='simulateTransaction'&&waitingPair){
  const first=waitingPair;waitingPair=null;clearTimeout(first.timer);
  try{
   if(first.url!==url)throw Error('DIAGNOSTIC_PAIR_ORIGIN');
   const response=await fetch(url,{...options,body:JSON.stringify([first.body,body]),signal:AbortSignal.any([first.options.signal,options.signal])});
   if(!response.ok){first.resolve(response.clone());return response;}
   const data=await response.json();if(!Array.isArray(data)||data.length!==2)throw Error('DIAGNOSTIC_PAIR_RESPONSE');
   const responses=[first.body.id,body.id].map(id=>{const v=data.filter(x=>x.id===id);if(v.length!==1)throw Error('DIAGNOSTIC_PAIR_ID');return new Response(JSON.stringify(v[0]),{headers:{'Content-Type':'application/json'}});});
   first.resolve(responses[0]);return responses[1];
  }catch(e){first.reject(e);throw e;}
 }
 return fetch(url,options);
};
const transport=createServerPerpsReadOnlyRpc({url:entry?.slice('JAMDDMAJ_PERPS_RPC_URL='.length),readSpacingMs:125,fetchImpl:rpcFetch});
const observed=new Map();let observedSize;
const request=async(method,params)=>{
 const r=await transport(method,params);
 if(method==='getMultipleAccounts'&&Array.isArray(r.value))params[0].forEach((address,i)=>observed.set(address,{account:r.value[i],slot:r.context?.slot}));
 if(method==='simulateTransaction'&&observedSize){
  const usdc='G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',j=params[1]?.accounts?.addresses?.indexOf(usdc),pre=observed.get(usdc),post=r.value?.accounts?.[j];
  if(pre?.account&&post&&j>=0){const a=Buffer.from(pre.account.data[0],'base64'),b=Buffer.from(post.data[0],'base64'),offsets=[];for(let k=286;k<a.length&&offsets.length<32;k++)if(a[k]!==b[k])offsets.push(k);console.log(JSON.stringify({stage:'collateral-custody-observation',sameBank:pre.slot===r.context?.slot,offsets}));
   const vaultAddress=bs58.encode(a.subarray(72,104)),v=params[1].accounts.addresses.indexOf(vaultAddress),oldVault=observed.get(vaultAddress)?.account,newVault=r.value.accounts[v];
   if(oldVault&&newVault){const debit=Buffer.from(oldVault.data[0],'base64').readBigUInt64LE(64)-Buffer.from(newVault.data[0],'base64').readBigUInt64LE(64),book=x=>x.readBigUInt64LE(214)+x.readBigUInt64LE(222),gap=book(a)-book(b)-debit,u128=(x,o)=>x.readBigUInt64LE(o)+(x.readBigUInt64LE(o+8)<<64n),matches=[];
    for(let power=0;power<=18;power++){const scale=10n**BigInt(power),debt=u128(b,1004)/scale-u128(a,1004)/scale;if(gap+debt===0n)matches.push(power);}
    console.log(JSON.stringify({stage:'book-observation',sameBank:pre.slot===r.context?.slot,gapPositive:gap>0n,zeroGap:gap===0n,debtPrecisionMatches:matches}));}
  }
  const address='5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',i=params[1]?.accounts?.addresses?.indexOf(address),previous=observed.get(address),next=r.value?.accounts?.[i];
  if(previous?.account&&next&&i>=0){try{
   checkPerpsCloseImpactHistory(Buffer.from(previous.account.data[0],'base64'),Buffer.from(next.data[0],'base64'),{sizeUsdUnits:observedSize,requestTimeSeconds:String(Math.floor(Date.now()/1000)),isMarket:true,side:'SHORT',nowSeconds:Math.floor(Date.now()/1000)});
   console.log(JSON.stringify({stage:'impact-observation',sameBank:previous.slot===r.context?.slot,matched:true}));
  }catch(e){console.log(JSON.stringify({stage:'impact-observation',sameBank:previous.slot===r.context?.slot,matched:false,diagnosticStage:e.diagnosticStage}));}}
 }
 return r;
};
if(process.argv[3]==='--idl'){
 const r=await request('getMultipleAccounts',[['38GK1i4cQPAxqrbfKX4RRMNfXpKRn5PgLFHVJeXm1C8Y'],{encoding:'base64',commitment:'confirmed'}]),a=r.value[0];
 if(a?.owner!=='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu')throw Error('IDL_OWNER');
 const b=Buffer.from(a.data[0],'base64'),raw=inflateSync(b.subarray(44,44+b.readUInt32LE(40))),digest=createHash('sha256').update(raw).digest('hex');
 if(digest!=='1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653')throw Error('IDL_HASH_CHANGED');
 const idl=JSON.parse(raw),types=[...(idl.types||[]),...(idl.accounts||[])];
 const type=n=>types.find(v=>v.name.toLowerCase()===n.toLowerCase())?.type;
 const size=t=>typeof t==='string'?({bool:1,u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,u64:8,i64:8,u128:16,i128:16,f32:4,f64:8,publicKey:32,pubkey:32}[t]??size(type(t))):t?.defined?size(type(typeof t.defined==='string'?t.defined:t.defined.name)):t?.array?size(t.array[0])*t.array[1]:t?.kind==='struct'?t.fields.reduce((n,f)=>n+size(f.type),0):t?.kind==='enum'&&t.variants.every(v=>!v.fields?.length)?1:NaN;
 const walk=(t,offset,name)=>{if(t?.defined)return walk(type(typeof t.defined==='string'?t.defined:t.defined.name),offset,name);if(t?.kind==='struct'){for(const f of t.fields){const length=size(f.type);if(offset<920&&offset+length>600){console.log(JSON.stringify({field:name+'.'+f.name,offset,length}));walk(f.type,offset,name+'.'+f.name);}offset+=length;}}};
 console.log(JSON.stringify({idlVerified:true,digest}));walk(type('Custody'),8,'Custody');process.exit(0);
}
const walletAddress='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';let stage='account';
try{
 const account=await readServerPerpsAccount({walletAddress},{request});
 const matches=account.positions.filter(p=>p.asset==='BTC'&&p.side==='SHORT');
 if(matches.length!==1)throw Error('EXPECTED_POSITION_NOT_OBSERVED');
 observedSize=matches[0].sizeUsdUnits;
 stage='reference';const referencePrice=await readPerpsMarketReference('BTC');
 stage='prepare';const result=await prepareSimulatedServerPerpsFullClose({walletAddress,positionAddress:matches[0].address,referencePrice,maxSlippageBps:50,settlement:'COLLATERAL_THEN_USDC'},
  {request,fetchImpl:async(url,options)=>{
   if(url!=='https://perps-api.jup.ag/v1/positions/decrease'||options.method!=='POST')throw Error('DIAGNOSTIC_NETWORK_REFUSED');
   const response=await fetch(url,options);console.log(JSON.stringify({stage:'builder',httpStatus:response.status}));return response;
  }});
 console.log(JSON.stringify({stage,ok:true,result:result.stage,readyForSigning:false,submitted:false}));
}catch(error){
 const code=/^[A-Z_]{1,110}$/.test(error.message||'')?error.message:'DIAGNOSTIC_UNAVAILABLE';
 const frames=String(error.stack).split('\n').slice(1,6).map(s=>s.match(/at ([A-Za-z0-9_]+)/)?.[1]||'anonymous');
 const diagnosticStage=/^[a-z-]{1,60}$/.test(error.diagnosticStage||'')?error.diagnosticStage:undefined;
 const diagnosticOffsets=Array.isArray(error.diagnosticOffsets)?error.diagnosticOffsets.filter(n=>Number.isSafeInteger(n)&&n>=0&&n<65536).slice(0,32):undefined;
 const diagnosticClockOffset=Number.isSafeInteger(error.diagnosticClockOffset)?error.diagnosticClockOffset:undefined;
 console.log(JSON.stringify({stage,ok:false,code,diagnosticStage,diagnosticOffsets,diagnosticClockOffset,diagnosticBook:error.diagnosticBook,frames,submitted:false}));process.exitCode=1;
}
