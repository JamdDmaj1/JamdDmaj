// Enumerate finalized address history, not a delayed trades index. This proves
// RPC coverage only: transaction effects must still be decoded and reconciled.
import {performance} from 'node:perf_hooks';
import bs58 from 'bs58';
import {deriveServerPerpsIdentities} from './perps-server-custody.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
function fail(){throw Error('INCOMPLETE_SERVER_PERPS_SIGNATURE_HISTORY');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function key(s,n){try{const b=bs58.decode(s);if(b.length!==n||bs58.encode(b)!==s)fail();return s;}catch{fail();}}
export function requireFreshServerPerpsSignatureHistory(value,{walletAddress,day}={}){
 const proof=proofs.get(value);if(!proof||value.walletAddress!==walletAddress||value.day!==day)fail();
 const age=proof.clock()-proof.finished;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export async function readServerPerpsSignatureHistory({walletAddress,day},{request,now=Date.now,monotonicNow=()=>performance.now(),pageSize=100,maxRows=1000}={}){
 key(walletAddress,32);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000
  ||!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>2000||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))fail();
 const observedAt=integer(now()),started=monotonicNow(),startTime=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(started)||!Number.isSafeInteger(startTime)||new Date(startTime).toISOString().slice(0,10)!==day||day!==new Date(observedAt).toISOString().slice(0,10))fail();
 let calls=0;
 const check=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000)fail();};
 const rpc=async(method,params)=>{check();if(++calls>100)fail();const value=await request(method,params);check();return value;};
 if(await rpc('getGenesisHash',[])!==GENESIS)fail();
 const anchorSlot=integer(await rpc('getSlot',[{commitment:'finalized'}]));
 const anchorTime=integer(await rpc('getBlockTime',[anchorSlot]));
 if(anchorTime*1000>observedAt+2000||observedAt-anchorTime*1000>120000||anchorTime*1000<startTime)fail();
 // Find a concrete retained block before this UTC day. The slot lookback is
 // only a search bound; its timestamp, not an assumed slot duration, proves it.
 const searchStart=Math.max(0,anchorSlot-432000),searchEnd=Math.min(anchorSlot,searchStart+63);
 const blocks=await rpc('getBlocks',[searchStart,searchEnd,{commitment:'finalized',minContextSlot:anchorSlot}]);
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>64||blocks.some((s,i)=>!Number.isSafeInteger(s)||s<searchStart||s>searchEnd||(i&&s<=blocks[i-1])))fail();
 const boundarySlot=blocks[0],boundaryTime=integer(await rpc('getBlockTime',[boundarySlot]));
 if(boundaryTime*1000>=startTime||integer(await rpc('getFirstAvailableBlock',[]))>boundarySlot)fail();
 const addresses=[walletAddress];for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])addresses.push((await deriveServerPerpsIdentities({walletAddress,asset,side})).position);
 if(new Set(addresses).size!==7)fail();
 const transactions=new Map(),coverage=[];let visited=0;
 async function scan(address){
  let before,previousSlot=Number.MAX_SAFE_INTEGER,complete=false;const seen=new Set();
  while(!complete){
   const options={commitment:'finalized',minContextSlot:anchorSlot,limit:pageSize};if(before)options.before=before;
   const rows=await rpc('getSignaturesForAddress',[address,options]);
   if(!Array.isArray(rows)||rows.length>pageSize)fail();
   for(const row of rows){
    if(++visited>maxRows*7||!row||row.confirmationStatus!=='finalized')fail();
    const signature=key(row.signature,64),slot=integer(row.slot);
    if(seen.has(signature)||slot>previousSlot||!Object.hasOwn(row,'err')||row.err!==null&&
      !((typeof row.err==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(row.err))||(row.err&&typeof row.err==='object'&&!Array.isArray(row.err)&&JSON.stringify(row.err).length<=4096)))fail();
    seen.add(signature);previousSlot=slot;
    if(slot<=boundarySlot){complete=true;break;}
    const blockTime=integer(row.blockTime);
    if(blockTime*1000<boundaryTime*1000||blockTime*1000>observedAt+2000)fail();
    if(slot>anchorSlot)continue;
    if(blockTime>anchorTime)fail();
    // RPC block timestamps are estimates, while ordering is by slot. Do not
    // end pagination just because one row's timestamp precedes midnight.
    if(blockTime*1000<startTime)continue;
    const existing=transactions.get(signature),failed=row.err!==null;
    if(existing){if(existing.slot!==slot||existing.blockTime!==blockTime||existing.failed!==failed)fail();existing.addresses.add(address);}
    else{if(transactions.size>=maxRows)fail();transactions.set(signature,{signature,slot,blockTime,failed,addresses:new Set([address])});}
   }
   if(rows.length<pageSize)complete=true;
   if(!complete){const next=rows.at(-1).signature;if(next===before)fail();before=next;}
  }
  coverage.push(Object.freeze({address,examined:seen.size,completeThroughSlot:anchorSlot}));
 }
 // Bound concurrent RPC work on the small VPS and on its provider.
 let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<addresses.length)await scan(addresses[next++]);}));
 if(integer(await rpc('getFirstAvailableBlock',[]))>boundarySlot||await rpc('getGenesisHash',[])!==GENESIS)fail();
 check();if(new Date(integer(now())).toISOString().slice(0,10)!==day)fail();const finished=monotonicNow();
 const rows=[...transactions.values()].sort((a,b)=>b.slot-a.slot||a.signature.localeCompare(b.signature))
  .map(row=>Object.freeze({...row,addresses:Object.freeze([...row.addresses].sort())}));
 const result=Object.freeze({stage:'FINALIZED_SIGNATURE_HISTORY',readyForSigning:false,network:'solana-mainnet',walletAddress,day,observedAt,
  observedSlot:anchorSlot,throughBlockTime:anchorTime,retainedBoundarySlot:boundarySlot,rows:Object.freeze(rows),coverage:Object.freeze(coverage),
  requiresTransactionAccounting:true,lossTodayUsdcUnits:null,tradesToday:null});
 proofs.set(result,{finished,clock:monotonicNow});return result;
}
