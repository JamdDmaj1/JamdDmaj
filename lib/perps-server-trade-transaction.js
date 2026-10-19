// Finalized, read-only event provenance. This is one transaction's evidence,
// never proof that a day's history is complete or permission to sign.
import {createPublicKey,verify} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import bs58 from 'bs58';
import {PERPS_PROGRAM,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {decodeServerPerpsTradeEvent} from './perps-server-trade-event.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const CPI_TAG=Buffer.from('e445a52e51cb9a1d','hex'),proofs=new WeakSet();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_TRADE_TRANSACTION');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function key(s,size=32){try{const b=bs58.decode(s);if(b.length!==size||bs58.encode(b)!==s)fail();return Buffer.from(b);}catch{fail();}}
function wireMessage(encoded,signature,loaded){
 if(typeof encoded!=='string'||encoded.length>1644)fail();
 const wire=Buffer.from(encoded,'base64');if(wire.toString('base64')!==encoded||wire.length>1232)fail();
 let offset=0;
 const take=n=>{if(n<0||n>wire.length-offset)fail();const value=wire.subarray(offset,offset+n);offset+=n;return value;};
 const byte=()=>take(1)[0];
 const compact=()=>{let n=0;for(let i=0;i<3;i++){const b=byte();if(i===2&&(b&252))fail();n|=(b&127)<<(i*7);if(!(b&128)){if(i>0&&!(b&127))fail();return n;}}fail();};
 const count=compact();if(count<1||count>16)fail();
 const signatures=take(count*64),message=wire.subarray(offset);
 if(!signatures.subarray(0,64).equals(key(signature,64)))fail();
 const prefix=byte(),version=(prefix&128)?0:-1;if((prefix&128)&&prefix!==128)fail();
 const required=version===0?byte():prefix,readonlySigned=byte(),readonlyUnsigned=byte(),staticCount=compact();
 if(required!==count||readonlySigned>=count||staticCount<count||staticCount>256||readonlyUnsigned>staticCount-count)fail();
 const keys=Array.from({length:staticCount},()=>bs58.encode(take(32)));take(32);
 const instructionCount=compact();if(instructionCount<1||instructionCount>64)fail();
 const instructions=Array.from({length:instructionCount},()=>({program:byte(),accounts:Array.from(take(compact())),data:take(compact())}));
 let writable=0,readonly=0;const tables=new Set();
 if(version===0){const tableCount=compact();if(tableCount>32)fail();for(let i=0;i<tableCount;i++){
  const table=bs58.encode(take(32));if(tables.has(table))fail();tables.add(table);
  const w=take(compact()),r=take(compact());if(!w.length&&!r.length||new Set([...w,...r]).size!==w.length+r.length)fail();writable+=w.length;readonly+=r.length;
 }}
 if(offset!==wire.length||!loaded||!Array.isArray(loaded.writable)||!Array.isArray(loaded.readonly)
  ||loaded.writable.length!==writable||loaded.readonly.length!==readonly)fail();
 for(const address of [...loaded.writable,...loaded.readonly]){key(address);keys.push(address);}
 if(keys.length>256||new Set(keys).size!==keys.length)fail();
 for(const ix of instructions)if(ix.program>=staticCount||ix.program===0||ix.accounts.some(i=>i>=keys.length))fail();
 for(let i=0;i<count;i++){
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key(keys[i])]),format:'der',type:'spki'});
  if(!verify(null,message,publicKey,signatures.subarray(i*64,(i+1)*64)))fail();
 }
 return {keys,instructions};
}
export function requireVerifiedServerPerpsTradeTransaction(proof){if(!proofs.has(proof))fail();return proof;}
export async function readServerPerpsTradeTransaction({walletAddress,signature,day},{request,now=Date.now,monotonicNow=()=>performance.now(),requireTradeEvent=true}={}){
 key(walletAddress);key(signature,64);
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))
  ||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||typeof requireTradeEvent!=='boolean')fail();
 const started=monotonicNow(),clock=integer(now());if(!Number.isFinite(started))fail();
 const deadline=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000)fail();};
 if(await request('getGenesisHash',[])!==GENESIS)fail();deadline();
 const tx=await request('getTransaction',[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);deadline();
 if(!tx||!Array.isArray(tx.transaction)||tx.transaction.length!==2||tx.transaction[1]!=='base64'||!tx.meta||!Object.hasOwn(tx.meta,'err'))fail();
 const failed=tx.meta.err!==null;
 if(failed&&(requireTradeEvent||!(typeof tx.meta.err==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(tx.meta.err)
  ||tx.meta.err&&typeof tx.meta.err==='object'&&!Array.isArray(tx.meta.err)&&JSON.stringify(tx.meta.err).length<=4096)))fail();
 const slot=integer(tx.slot),blockTime=integer(tx.blockTime),timestamp=blockTime*1000;
 if(!Number.isSafeInteger(timestamp)||timestamp>clock+2000||new Date(timestamp).toISOString().slice(0,10)!==day)fail();
 integer(tx.meta.fee);
 const {keys,instructions}=wireMessage(tx.transaction[0],signature,tx.meta.loadedAddresses??{writable:[],readonly:[]});
 const inner=failed&&tx.meta.innerInstructions===null?[]:tx.meta.innerInstructions;
 if(!keys.includes(walletAddress)||!Array.isArray(inner)||inner.length>64)fail();
 const authority=(await deriveServerPerpsIdentities({walletAddress,asset:'SOL',side:'LONG'})).eventAuthority;
 const groups=new Set(),events=[];let total=0,unknownPerpsEvents=0,perpsActivity=instructions.some(ix=>keys[ix.program]===PERPS_PROGRAM);
 for(const group of inner){
  const index=integer(group?.index);if(index>=instructions.length||groups.has(index)||!Array.isArray(group.instructions))fail();groups.add(index);
  for(let ordinal=0;ordinal<group.instructions.length;ordinal++){
   const ix=group.instructions[ordinal];if(++total>512||!ix||!Number.isSafeInteger(ix.programIdIndex)||ix.programIdIndex<0||ix.programIdIndex>=keys.length
    ||!Array.isArray(ix.accounts)||ix.accounts.length>256||ix.accounts.some(i=>!Number.isSafeInteger(i)||i<0||i>=keys.length)
    ||typeof ix.data!=='string'||ix.data.length>4096)fail();
   let data;try{data=Buffer.from(bs58.decode(ix.data));if(bs58.encode(data)!==ix.data)fail();}catch{fail();}
   if(keys[ix.programIdIndex]!==PERPS_PROGRAM)continue;
   perpsActivity=true;if(!data.subarray(0,8).equals(CPI_TAG))continue;
   // Anchor's event handler requires its PDA to sign this self-CPI. A top-level
   // instruction, foreign program or arbitrary "Program data" log cannot qualify.
   if(!Number.isSafeInteger(ix.stackHeight)||ix.stackHeight<2||ix.stackHeight>64
    ||ix.accounts.length!==1||keys[ix.accounts[0]]!==authority)fail();
   // Failed transactions roll all program effects back. Their logs/CPI output
   // may describe attempted, not committed, positions and must not count as P/L.
   if(failed)continue;
   const event=await decodeServerPerpsTradeEvent(data.subarray(8),{walletAddress});
   if(event)events.push(Object.freeze({...event,stage:'FINALIZED_CPI_TRADE_EVENT',requiresVerifiedChainOrigin:false,instructionIndex:index,innerInstructionIndex:ordinal}));
   else unknownPerpsEvents++;
  }
 }
 // No event is not evidence of zero loss. In particular, legacy log-only
 // transactions must be reconciled by a separate complete-history reader.
 if(requireTradeEvent&&!events.length)fail();deadline();
 if(await request('getGenesisHash',[])!==GENESIS)fail();deadline();
 const proof=Object.freeze({stage:'FINALIZED_TRADE_TRANSACTION',readyForSigning:false,network:'solana-mainnet',walletAddress,signature,slot,blockTime,day,
  transactionFeeLamports:String(tx.meta.fee),walletFeeLamports:keys[0]===walletAddress?String(tx.meta.fee):'0',failed,perpsActivity,unknownPerpsEvents,
  events:Object.freeze(events),requiresCompleteDailyHistory:true,observedAt:clock});
 proofs.add(proof);return proof;
}
