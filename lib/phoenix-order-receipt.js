// Read-only reconciliation of one already-signed, exact native order. This is
// not a custody grant, broadcaster, durable journal or proof of USDC settlement.
import {createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {getPlaceMarketOrderDecoder,getEmberDepositEncoder,getDepositFundsEncoder,Side,OrderFlags,SelfTradeBehavior} from '@ellipsis-labs/rise';
import {requirePhoenixUnsignedWire} from './phoenix-order-wire.js';
import {decodePhoenixOrderEvents} from './phoenix-order-events.js';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const evidence=new WeakMap();
const finalized=new WeakMap();
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

// Archival/reconstruction is read-only. Restored evidence cannot pass any
// pre-signing seal and must never be accepted by the custody signer.
export function archivePhoenixSignedOrder(value){
 const p=evidence.get(value);if(!p)fail('UNVERIFIED');const {plan}=p;
 return Object.freeze({version:1,serializedTxBase64:value.serializedTxBase64,walletAddress:plan.walletAddress,
  symbol:plan.symbol,side:plan.side,close:plan.close,isolatedSubaccountIndex:plan.isolatedSubaccountIndex,
  observedSlot:plan.observedSlot,marginUsdcUnits:plan.marginUsdcUnits,baseLots:plan.baseLots,
  maxNotionalUsdcUnits:plan.maxNotionalUsdcUnits,priceInTicks:plan.packet.priceInTicks.toString(),
  clientOrderId:plan.packet.clientOrderId.toString(),lastValidSlot:plan.packet.lastValidSlot.toString(),
  assetId:plan.market.assetId,tickSize:plan.market.tickSize,baseLotsDecimals:plan.market.baseLotsDecimals,
  feeMicro:plan.market.feeMicro});
}

export async function restorePhoenixSignedOrder(archive){
 if(!archive||archive.version!==1||typeof archive.close!=='boolean'||!['LONG','SHORT'].includes(archive.side)||
    typeof archive.symbol!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(archive.symbol)||
    !Number.isSafeInteger(archive.observedSlot)||archive.observedSlot<1||archive.observedSlot>Number.MAX_SAFE_INTEGER-30||
    !Number.isInteger(archive.assetId)||archive.assetId<0||archive.assetId>0xffffffff||
    !Number.isInteger(archive.baseLotsDecimals)||Math.abs(archive.baseLotsDecimals)>12||
    !Number.isInteger(archive.feeMicro)||archive.feeMicro<0||archive.feeMicro>10000)fail('ARCHIVE');
 const uint=(v,bits=64)=>{if(typeof v!=='string'||!/^(0|[1-9]\d{0,38})$/.test(v)||BigInt(v)>=2n**BigInt(bits))fail('ARCHIVE');return BigInt(v);};
 const qty=uint(archive.baseLots),margin=uint(archive.marginUsdcUnits),price=uint(archive.priceInTicks),tick=uint(archive.tickSize);
 const nonce=uint(archive.clientOrderId,128),lastSlot=uint(archive.lastValidSlot);
 if(qty===0n||price===0n||tick===0n||tick>0xffffffffn||nonce===0n||lastSlot!==BigInt(archive.observedSlot+30)||
    (archive.close?(margin!==0n||archive.maxNotionalUsdcUnits!==null):(margin<10000000n||uint(archive.maxNotionalUsdcUnits)===0n)))fail('ARCHIVE');
 phoenixKey(archive.walletAddress);
 const signed=base64(archive.serializedTxBase64);
 if(signed.length<100||signed[0]!==1)fail('WIRE');
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(archive.walletAddress))]),format:'der',type:'spki'});
 if(!verify(null,signed.subarray(65),key,signed.subarray(1,65)))fail('SIGNATURE');
 const message=getCompiledTransactionMessageDecoder().decode(signed.subarray(65));
 if(message.version!=='legacy'||message.header.numSignerAccounts!==1||message.staticAccounts[0]!==archive.walletAddress||
    message.instructions.length!==(archive.close?3:6))fail('ARCHIVE');
 const order=message.instructions.at(-1),decoded=getPlaceMarketOrderDecoder().decode(order.data),packet=decoded.orderPacket??decoded;
 const addresses=await derivePhoenixWalletAccounts(archive.walletAddress,archive.isolatedSubaccountIndex);
 if(message.staticAccounts[order.programAddressIndex]!==ID.program||order.accountIndices.length<8||
    message.staticAccounts[order.accountIndices[3]]!==archive.walletAddress||message.staticAccounts[order.accountIndices[4]]!==addresses.trader||
    packet.side!==(archive.side==='LONG'?Side.Bid:Side.Ask)||packet.numBaseLots!==qty||packet.minBaseLotsToFill!==qty||
    packet.priceInTicks!==price||packet.clientOrderId!==nonce||packet.lastValidSlot!==lastSlot||packet.cancelExisting!==false||
    packet.selfTradeBehavior!==SelfTradeBehavior.Abort||packet.orderFlags!==(archive.close?OrderFlags.ReduceOnly:OrderFlags.None)||
    packet.numQuoteLots!==(archive.close?null:BigInt(archive.maxNotionalUsdcUnits)))fail('ARCHIVE');
 if(!archive.close){
  const ember=message.instructions[3],deposit=message.instructions[4];
  if(message.staticAccounts[ember.programAddressIndex]!==ID.ember||message.staticAccounts[deposit.programAddressIndex]!==ID.program||
     !Buffer.from(ember.data).equals(Buffer.from(getEmberDepositEncoder().encode(margin)))||
     !Buffer.from(deposit.data).equals(Buffer.from(getDepositFundsEncoder().encode(margin)))||
     message.staticAccounts[ember.accountIndices[0]]!==archive.walletAddress||message.staticAccounts[ember.accountIndices[4]]!==addresses.usdcAta||
     message.staticAccounts[ember.accountIndices[5]]!==addresses.canonicalAta||
     message.staticAccounts[deposit.accountIndices[5]]!==addresses.trader)fail('ARCHIVE');
 }
 const plan=Object.freeze({walletAddress:archive.walletAddress,symbol:archive.symbol,side:archive.side,close:archive.close,
  isolatedSubaccountIndex:archive.isolatedSubaccountIndex,observedSlot:archive.observedSlot,baseLots:archive.baseLots,
  marginUsdcUnits:archive.marginUsdcUnits,maxNotionalUsdcUnits:archive.maxNotionalUsdcUnits,
  packet:Object.freeze({priceInTicks:price,clientOrderId:nonce,lastValidSlot:lastSlot}),
  market:Object.freeze({assetId:archive.assetId,tickSize:archive.tickSize,baseLotsDecimals:archive.baseLotsDecimals,feeMicro:archive.feeMicro})});
 const result=Object.freeze({stage:'PHOENIX_SIGNED_ORDER_EVIDENCE',signature:bs58.encode(signed.subarray(1,65)),walletAddress:plan.walletAddress,
  serializedTxBase64:archive.serializedTxBase64,restoredForReadOnlyReconciliation:true,readyForTrading:false});
 evidence.set(result,{plan,checked:{addresses},message,signed,minimumSlot:plan.observedSlot});return result;
}

export function requirePhoenixFinalizedOrder(value,{signature}={}){
 const p=finalized.get(value);if(!p||(signature&&signature!==value.signature))fail('UNVERIFIED');return value;
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
 const seal=record=>{const result=Object.freeze(record);finalized.set(result,{evidence:value});return result;};
 if(tx.meta.err!==null)return seal({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:'FAILED',
  slot:tx.slot,networkFeeLamports:String(tx.meta.fee),platformFeeDueUnits:'0',walletCredited:false,mayRetry:false});
 const {plan,message,checked}=p;
 let events;
 try{events=decodePhoenixOrderEvents({innerInstructions:tx.meta.innerInstructions,staticAccountKeys:message.staticAccounts,
  outerInstructionIndex:message.instructions.length-1,expected:{walletAddress:plan.walletAddress,traderAddress:checked.addresses.trader,
   symbol:plan.symbol,assetId:plan.market.assetId,tickSize:plan.market.tickSize,baseLotsDecimals:plan.market.baseLotsDecimals,
   slot:tx.slot,clientOrderId:plan.packet.clientOrderId.toString(),orderPacketBase64:Buffer.from(message.instructions.at(-1).data).subarray(8).toString('base64')}});}
 catch(error){
  if(error?.message!=='PHOENIX_EVENTS_PROGRAM')throw error;
  // Address lookups index inner instructions against the resolved key list.
  const detailed=await request('getTransaction',[value.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  const staticKeys=(detailed?.transaction?.message?.accountKeys??[]).map(k=>typeof k==='string'?k:k?.pubkey);
  const loaded=detailed?.meta?.loadedAddresses;
  if(!staticKeys.length)throw error;
  events=decodePhoenixOrderEvents({innerInstructions:tx.meta.innerInstructions,staticAccountKeys:[...staticKeys,...(loaded?.writable??[]),...(loaded?.readonly??[])],
  outerInstructionIndex:message.instructions.length-1,expected:{walletAddress:plan.walletAddress,traderAddress:checked.addresses.trader,
   symbol:plan.symbol,assetId:plan.market.assetId,tickSize:plan.market.tickSize,baseLotsDecimals:plan.market.baseLotsDecimals,
   slot:tx.slot,clientOrderId:plan.packet.clientOrderId.toString(),orderPacketBase64:Buffer.from(message.instructions.at(-1).data).subarray(8).toString('base64')}});
 }
 const fill=events.summary;
 if(events.outcome!=='FILLED'){
  if(fill&&(fill.baseLotsFilled!=='0'||fill.quoteLotsFilled!=='0'||fill.feeUnits!=='0'))fail('NO_FILL');
  return seal({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:'NO_FILL',slot:tx.slot,
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
 return seal({stage:'PHOENIX_FINALIZED_ORDER',signature:value.signature,state:plan.close?'POSITION_CLOSED':'POSITION_OPEN',
  slot:tx.slot,symbol:plan.symbol,side:plan.side,traderAddress:checked.addresses.trader,fill,
  networkFeeLamports:String(tx.meta.fee),walletCredited:false,requiresCollateralReconciliation:plan.close,mayRetry:false});
}
