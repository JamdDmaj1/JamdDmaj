// Read-only reconciliation of one already-signed, exact native order. This is
// not a custody grant, broadcaster, durable journal or proof of USDC settlement.
import {createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {requirePhoenixUnsignedWire} from './phoenix-order-wire.js';
import {decodePhoenixOrderEvents} from './phoenix-order-events.js';

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const evidence=new WeakMap();
const fail=code=>{throw Error('PHOENIX_RECEIPT_'+code);};
function base64(value){
 if(typeof value!=='string'||value.length>1644)fail('WIRE');
 const b=Buffer.from(value,'base64');if(b.toString('base64')!==value)fail('WIRE');return b;
}

export function capturePhoenixSignedOrder(wire,serializedTxBase64){
 const {review,checked}=requirePhoenixUnsignedWire(wire),plan=review.plan;
 const signed=base64(serializedTxBase64),unsigned=base64(wire.serializedTxBase64);
 if(signed.length!==unsigned.length||signed[0]!==1||!signed.subarray(65).equals(unsigned.subarray(65)))fail('WIRE');
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(plan.walletAddress))]),format:'der',type:'spki'});
 if(!verify(null,signed.subarray(65),publicKey,signed.subarray(1,65)))fail('SIGNATURE');
 const message=getCompiledTransactionMessageDecoder().decode(signed.subarray(65));
 const result=Object.freeze({stage:'PHOENIX_SIGNED_ORDER_EVIDENCE',signature:bs58.encode(signed.subarray(1,65)),
  walletAddress:plan.walletAddress,messageHash:wire.messageHash,serializedTxBase64,
  requiresDurableJournalBeforeBroadcast:true,requiresFinalizedReconciliation:true,readyForTrading:false});
 // Keep an immutable expectation independent of the short pre-signing TTL:
 // an already sent order must remain queryable after its review has expired.
 evidence.set(result,{plan,checked,message,signed,minimumSlot:plan.observedSlot});return result;
}

export async function reconcilePhoenixOrder(value,{request}={}){
 const p=evidence.get(value);if(!p||typeof request!=='function')fail('UNVERIFIED');
 if(await request('getGenesisHash',[])!==MAINNET)fail('NETWORK');
 const status=await request('getSignatureStatuses',[[value.signature],{searchTransactionHistory:true}]);
 if(!Number.isSafeInteger(status?.context?.slot)||status.context.slot<p.minimumSlot||!Array.isArray(status.value)||status.value.length!==1)fail('STATUS');
 const s=status.value[0];
 const pending=()=>Object.freeze({stage:'PHOENIX_ORDER_UNRESOLVED',signature:value.signature,state:'UNKNOWN',
  mayRetry:false,requiresReconciliation:true,walletCredited:false});
 if(s===null)return pending();
 if(!Number.isSafeInteger(s.slot)||s.slot<p.minimumSlot||s.slot>status.context.slot||!['processed','confirmed','finalized'].includes(s.confirmationStatus)||
    (s.err!==null&&(!s.err||typeof s.err!=='object')))fail('STATUS');
 if(s.confirmationStatus!=='finalized')return pending();
 const tx=await request('getTransaction',[value.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(tx===null)return pending();
 if(tx.slot!==s.slot||!Array.isArray(tx.transaction)||tx.transaction.length!==2||tx.transaction[1]!=='base64'||
    !base64(tx.transaction[0]).equals(p.signed)||!tx.meta||!Number.isSafeInteger(tx.meta.fee)||tx.meta.fee<5000||tx.meta.fee>19000)fail('TRANSACTION');
 if(await request('getGenesisHash',[])!==MAINNET)fail('NETWORK');
 if(JSON.stringify(tx.meta.err)!==JSON.stringify(s.err))fail('STATUS_CONFLICT');
 if(tx.meta.err!==null)return Object.freeze({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:'FAILED',
  slot:tx.slot,networkFeeLamports:String(tx.meta.fee),platformFeeDueUnits:'0',walletCredited:false,mayRetry:false});
 const {plan,message,checked}=p;
 const events=decodePhoenixOrderEvents({innerInstructions:tx.meta.innerInstructions,staticAccountKeys:message.staticAccounts,
  outerInstructionIndex:message.instructions.length-1,expected:{walletAddress:plan.walletAddress,traderAddress:checked.addresses.trader,
   symbol:plan.symbol,assetId:plan.market.assetId,tickSize:plan.market.tickSize,baseLotsDecimals:plan.market.baseLotsDecimals,
   slot:tx.slot,clientOrderId:plan.packet.clientOrderId.toString(),orderPacketBase64:Buffer.from(message.instructions.at(-1).data).subarray(8).toString('base64')}});
 const fill=events.summary;
 if(events.outcome!=='FILLED'){
  if(fill&&(fill.baseLotsFilled!=='0'||fill.quoteLotsFilled!=='0'||fill.feeUnits!=='0'))fail('NO_FILL');
  return Object.freeze({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:'NO_FILL',slot:tx.slot,
   networkFeeLamports:String(tx.meta.fee),platformFeeDueUnits:'0',walletCredited:false,
   requiresCollateralReconciliation:!plan.close,mayRetry:false});
 }
 const qty=BigInt(plan.baseLots),quote=BigInt(fill.quoteLotsFilled),limit=qty*plan.packet.priceInTicks*BigInt(plan.market.tickSize);
 if(fill.side!==plan.side||fill.baseLotsFilled!==plan.baseLots||quote<1n||
    (plan.side==='LONG'?quote>limit:quote<limit)||
    (!plan.close&&quote>BigInt(plan.maxNotionalUsdcUnits))||
    BigInt(fill.feeUnits)>(quote*BigInt(plan.market.feeMicro)+999999n)/1000000n+1n||BigInt(fill.postQuoteCollateralUnits)<0n)fail('FILL');
 if(plan.close?(fill.postBaseLots!=='0'||fill.postVirtualQuoteLots!=='0'):
    (BigInt(fill.postBaseLots)!==(plan.side==='LONG'?qty:-qty)||BigInt(fill.postVirtualQuoteLots)!==(plan.side==='LONG'?-quote:quote)||
     BigInt(fill.postQuoteCollateralUnits)!==BigInt(plan.marginUsdcUnits)-BigInt(fill.feeUnits)))fail('POSITION');
 return Object.freeze({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:plan.close?'POSITION_CLOSED':'POSITION_OPEN',
  slot:tx.slot,symbol:plan.symbol,side:plan.side,traderAddress:checked.addresses.trader,fill,
  networkFeeLamports:String(tx.meta.fee),walletCredited:false,requiresCollateralReconciliation:plan.close,mayRetry:false});
}
