// Finalized second-leg payout only. This does not sign/send, mutate a journal,
// prove ownership of finalized first-leg proceeds or release daily/capital risk.
import {createHash} from 'node:crypto';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {readConstructedPerpsCloseConversionWire} from './perps-close-conversion-wire.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities} from './perps-server-custody.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const EVENT='e445a52e51cb9a1d286bd41adf8827dc',proofs=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_CONVERSION_RECEIPT');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function units(s){if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(s)||BigInt(s)>18446744073709551615n)fail();return BigInt(s);}
function address(s,size=32){try{const b=bs58.decode(s);if(b.length!==size||bs58.encode(b)!==s)fail();return Buffer.from(b);}catch{fail();}}
// Program-owned Anchor IDL hash 1d90a653...f7d653, reread at 459579951.
// Decoding is not evidence of CPI origin or transaction finalization.
export function decodePerpsCloseConversionSwapEvent(payload){
 if(!(payload instanceof Uint8Array))fail();const b=Buffer.from(payload);
 if(b.length!==208||b.subarray(0,8).toString('hex')!=='286bd41adf8827dc')fail();
 const fields={receivingCustody:bs58.encode(b.subarray(8,40)),dispensingCustody:bs58.encode(b.subarray(40,72)),pool:bs58.encode(b.subarray(72,104)),
  amountIn:b.readBigUInt64LE(104).toString(),amountOut:b.readBigUInt64LE(112).toString(),swapUsdAmount:b.readBigUInt64LE(120).toString(),
  amountOutAfterFees:b.readBigUInt64LE(128).toString(),feeBps:b.readBigUInt64LE(136).toString(),owner:bs58.encode(b.subarray(144,176)),receivingAccount:bs58.encode(b.subarray(176,208))};
 if(units(fields.amountIn)===0n||units(fields.amountOutAfterFees)===0n||units(fields.amountOut)<units(fields.amountOutAfterFees)||units(fields.swapUsdAmount)===0n||units(fields.feeBps)>10000n)fail();
 return Object.freeze({...fields,readyForSigning:false,requiresVerifiedNativeCpi:true});
}
export function requireVerifiedPerpsCloseConversionReceipt(value){
 const p=proofs.get(value);if(!p)fail();const elapsed=p.monotonicNow()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();return value;
}
export async function readFinalizedPerpsCloseConversionReceipt(wire,identity,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const {collateral:c,usdc}=readConstructedPerpsCloseConversionWire(wire);identity=structuredClone(identity);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 address(identity?.signature,64);if(typeof identity.wireHash!=='string'||!/^[a-f0-9]{64}$/.test(identity.wireHash))fail();
 const created=integer(identity.createdAt),minimumSlot=integer(identity.minimumSlot??0),clock=integer(now()),started=monotonicNow();
 if(!Number.isFinite(started)||created>clock+2000)fail();
 const fresh=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();};
 if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const statuses=structuredClone(await request('getSignatureStatuses',[[identity.signature],{searchTransactionHistory:true}]));fresh();
 if(!Array.isArray(statuses?.value)||statuses.value.length!==1)fail();const status=statuses.value[0];
 if(status===null||['processed','confirmed'].includes(status?.confirmationStatus))return null;
 if(status?.confirmationStatus!=='finalized'||status.err!==null)fail();
 const slot=integer(status.slot);if(slot<minimumSlot||integer(statuses.context?.slot)<slot)fail();
 const captured=structuredClone(await request('getTransaction',[identity.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]));fresh();
 if(captured===null)return null;if(integer(captured.slot)!==slot||!captured.meta||captured.meta.err!==null)fail();
 const timestamp=integer(captured.blockTime)*1000;if(!Number.isSafeInteger(timestamp)||timestamp<created-2000||timestamp>clock+2000)fail();
 const transaction=await readServerPerpsTradeTransaction({walletAddress:wire.walletAddress,signature:identity.signature,day:new Date(timestamp).toISOString().slice(0,10)},
  {request:(m,p)=>m==='getTransaction'?Promise.resolve(captured):request(m,p),now:()=>clock,monotonicNow,requireTradeEvent:false});fresh();
 const evidence=readVerifiedPerpsTransactionEvidence(transaction),{keys,instructions,meta}=evidence,raw=Buffer.from(evidence.wire,'base64');
 if(transaction.failed||transaction.slot!==slot||transaction.events.length||transaction.unknownPerpsEvents!==1||keys[0]!==wire.walletAddress
  ||raw[0]!==1||hash(raw)!==identity.wireHash||!raw.subarray(1,65).equals(address(identity.signature,64))
  ||!ed25519.verify(raw.subarray(1,65),raw.subarray(65),address(wire.walletAddress),{zip215:false}))fail();
 const unsigned=Buffer.from(raw);unsigned.fill(0,1,65);if(unsigned.toString('base64')!==wire.serializedTxBase64)fail();
 const cores=instructions.map((ix,index)=>({...ix,index})).filter(ix=>keys[ix.program]===PERPS_PROGRAM);
 if(cores.length!==1)fail();const core=cores[0],ids=await deriveServerPerpsIdentities({walletAddress:wire.walletAddress,asset:wire.asset,side:'LONG'});
 const roles=core.accounts.map(i=>keys[i]),coreData=Buffer.from(core.data);
 if(coreData.length!==24||coreData.subarray(0,8).toString('hex')!=='414b3f4ceb5b5b88'||coreData.readBigUInt64LE(8)!==units(wire.amountUnits)
  ||coreData.readBigUInt64LE(16)!==units(wire.minimumUsdcUnits)||roles.length!==17||roles[1]!==wire.source||roles[2]!==wire.destination)fail();
 const fee=integer(meta.fee);if(fee<1||fee>1000000||BigInt(fee)<(BigInt(wire.computeUnitLimit)*BigInt(wire.computeUnitPriceMicroLamports)+999999n)/1000000n)fail();
 for(const list of [meta.preBalances,meta.postBalances])if(!Array.isArray(list)||list.length!==keys.length||list.some(n=>!Number.isSafeInteger(n)||n<0))fail();
 const lam=(after,key)=>{const i=keys.indexOf(key);if(i<0)fail();return BigInt((after?meta.postBalances:meta.preBalances)[i]);};
 function balances(list){
  if(!Array.isArray(list)||list.length>keys.length)fail();const result=new Map();
  for(const b of list){const i=integer(b?.accountIndex);if(i>=keys.length||result.has(keys[i])||b.programId!==undefined&&b.programId!==TOKEN)fail();
   address(b.owner);address(b.mint);units(b.uiTokenAmount?.amount);if(integer(b.uiTokenAmount?.decimals)>18)fail();result.set(keys[i],b);
  }return result;
 }
 const pre=balances(meta.preTokenBalances),post=balances(meta.postTokenBalances);
 const amount=(after,key,owner,mint,decimals)=>{
  const item=(after?post:pre).get(key);if(!item){if(lam(after,key)!==0n)fail();return 0n;}
  if(item.owner!==owner||item.mint!==mint||item.uiTokenAmount.decimals!==decimals)fail();const n=units(item.uiTokenAmount.amount);if(n>0n&&lam(after,key)===0n)fail();return n;
 };
 const source=a=>amount(a,wire.source,wire.walletAddress,c.mint,c.decimals),dest=a=>amount(a,wire.destination,wire.walletAddress,usdc.mint,usdc.decimals);
 const vault=(a,custody)=>amount(a,custody.tokenAccount,ids.transferAuthority,custody.mint,custody.decimals);
 const input=units(wire.amountUnits),received=dest(true)-dest(false);if(received<units(wire.minimumUsdcUnits)||received<=0n)fail();
 if(vault(true,c)-vault(false,c)!==input||vault(false,usdc)-vault(true,usdc)!==received
  ||lam(true,c.tokenAccount)-lam(false,c.tokenAccount)!==(wire.asset==='SOL'?input:0n)||lam(true,usdc.tokenAccount)!==lam(false,usdc.tokenAccount))fail();
 let locked=0n,refunded=0n;
 if(lam(false,wire.destination)===0n)locked+=lam(true,wire.destination);else if(lam(false,wire.destination)!==lam(true,wire.destination))fail();
 if(wire.nativeSolInput){
  if(wire.closeWrappedAccount){if(source(false)!==0n||source(true)!==0n||lam(true,wire.source)!==0n)fail();refunded+=lam(false,wire.source);}
  else if(lam(false,wire.source)===0n){if(source(true)!==0n)fail();locked+=lam(true,wire.source);}
  else if(lam(true,wire.source)!==lam(false,wire.source)||source(true)<source(false))fail();
 }else if(source(false)-source(true)!==input||lam(true,wire.source)-lam(false,wire.source)!==(wire.asset==='SOL'?-input:0n))fail();
 const ownerDelta=lam(true,wire.walletAddress)-lam(false,wire.walletAddress);
 if(ownerDelta!==-BigInt(fee)-(wire.nativeSolInput?input:0n)-locked+refunded)fail();
 const permitted=new Set([wire.walletAddress,wire.source,wire.destination,c.tokenAccount,usdc.tokenAccount]);
 for(const key of keys)if(!permitted.has(key)&&(lam(false,key)!==lam(true,key)||JSON.stringify(pre.get(key))!==JSON.stringify(post.get(key))))fail();
 const group=meta.innerInstructions.find(g=>g.index===core.index),transfers=[],events=[];
 for(const ix of group?.instructions??[]){
  if(!Number.isSafeInteger(ix.stackHeight)||ix.stackHeight<2||ix.stackHeight>64)fail();
  const program=keys[ix.programIdIndex],data=Buffer.from(bs58.decode(ix.data)),accounts=ix.accounts.map(i=>keys[i]);
  if(program===TOKEN){
   if(data[0]===3&&data.length===9&&accounts.length===3)transfers.push({source:accounts[0],destination:accounts[1],authority:accounts[2],amount:data.readBigUInt64LE(1)});
   else if(data[0]===12&&data.length===10&&accounts.length===4){
    const cust=accounts[1]===c.mint?c:accounts[1]===usdc.mint?usdc:null;if(!cust||data[9]!==cust.decimals)fail();
    transfers.push({source:accounts[0],destination:accounts[2],authority:accounts[3],amount:data.readBigUInt64LE(1)});
   }else fail();
  }else if(program===PERPS_PROGRAM){if(data.length!==216||data.subarray(0,16).toString('hex')!==EVENT||accounts.length!==1||accounts[0]!==ids.eventAuthority||ix.stackHeight<2)fail();events.push(data.subarray(8));}
  else fail();
 }
 if(transfers.length!==2||events.length!==1)fail();
 for(const expected of [{source:wire.source,destination:c.tokenAccount,authority:wire.walletAddress,amount:input},{source:usdc.tokenAccount,destination:wire.destination,authority:ids.transferAuthority,amount:received}]){
  if(transfers.filter(t=>t.source===expected.source&&t.destination===expected.destination&&t.authority===expected.authority&&t.amount===expected.amount).length!==1)fail();
 }
 const event=decodePerpsCloseConversionSwapEvent(events[0]),gross=units(event.amountOut);
 if(event.receivingCustody!==c.address||event.dispensingCustody!==usdc.address||event.pool!==PERPS_POOL||event.owner!==wire.walletAddress||event.receivingAccount!==wire.destination
  ||event.amountIn!==input.toString()||event.amountOutAfterFees!==received.toString())fail();
 fresh();const result=Object.freeze({stage:'FINALIZED_PROTECTED_CONVERSION_PAYOUT_ONLY',readyForSigning:false,tradingEnabled:false,walletAddress:wire.walletAddress,asset:wire.asset,
  signature:identity.signature,wireHash:identity.wireHash,unsignedWireHash:hash(unsigned),slot,blockTime:captured.blockTime,executionDay:transaction.day,observedAt:clock,
  convertedTokenUnits:input.toString(),receivedUsdcUnits:received.toString(),minimumUsdcUnits:wire.minimumUsdcUnits,networkFeeLamports:String(fee),
  rentLockedLamports:locked.toString(),rentRefundedLamports:refunded.toString(),walletSolChangeLamports:ownerDelta.toString(),swapFeeUsdcUnits:(gross-received).toString(),
  requiresFinalizedCloseAndSignedJournalBinding:true,requiresCompleteDailyAccounting:true});
 proofs.set(result,{started,monotonicNow});return result;
}
