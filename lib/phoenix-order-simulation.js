// Exact-wire read-only simulation and effect conservation. No fee-only/no-fill
// simulation can grant signing; no response can be used for another wire.
import {requirePhoenixUnsignedWire} from './phoenix-order-wire.js';
import {requireFreshPhoenixNativeMarket} from './phoenix-native-market.js';
import {requireFreshPhoenixChainAccount,decodePhoenixRpcTrader,decodePhoenixRpcToken,decodePhoenixRpcPayer} from './phoenix-chain-account.js';
import {PHOENIX_IDENTITIES as ID} from './phoenix-market-plan.js';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import bs58 from 'bs58';
import {decodePhoenixOrderEvents} from './phoenix-order-events.js';

const proofs=new WeakMap();
const fail=code=>{throw Error('PHOENIX_SIMULATION_'+code);};
const hasExposure=p=>BigInt(p.baseLots)!==0n||BigInt(p.virtualQuoteLots)!==0n;
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail('RESPONSE');return BigInt(value);}

// A v0 message indexes inner instructions against static keys plus the lookup
// tables, so the event decoder needs the resolved list. Falls back to the static
// list when the tables cannot be read, which keeps the old strict behaviour.
async function resolvedStaticKeys(message,request){
 const statics=message.staticAccounts??[];
 const lookups=message.addressTableLookups??[];
 if(!lookups.length)return statics;
 try{
  const writable=[],readonly=[];
  for(const lookup of lookups){
   const table=lookup.lookupTableAddress??lookup.tableAddress;
   const info=await request('getAccountInfo',[table,{encoding:'base64',commitment:'confirmed'}]);
   const data=Buffer.from(info?.value?.data?.[0]??'','base64');
   if(data.length<56)fail('LOOKUP');
   const count=Math.floor((data.length-56)/32);
   const at=i=>{if(!Number.isInteger(i)||i<0||i>=count)fail('LOOKUP');return bs58.encode(data.subarray(56+i*32,56+(i+1)*32));};
   for(const i of lookup.writableIndexes??[])writable.push(at(i));
   for(const i of lookup.readonlyIndexes??[])readonly.push(at(i));
  }
  return [...statics,...writable,...readonly];
 }catch{return statics;}
}
export async function simulatePhoenixOrder({wire,native,account}={},
 {request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const material=requirePhoenixUnsignedWire(wire),plan=material.review.plan;
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail('INPUT');
 const started=monotonicNow();if(!Number.isFinite(started))fail('INPUT');
 const current=()=>{
  requirePhoenixUnsignedWire(wire);
  requireFreshPhoenixNativeMarket(native,{plan,request});
  requireFreshPhoenixChainAccount(account,{walletAddress:plan.walletAddress,minimumSlot:plan.observedSlot,request});
 };
 current();
 if(material.checked.exchangeKeyFingerprint!==native.exchangeKeyFingerprint)fail('NATIVE_KEY_BINDING');
 const parent=account.subaccounts.find(s=>s.subaccountIndex===0);
 const child=account.subaccounts.find(s=>s.subaccountIndex===plan.isolatedSubaccountIndex);
 if(!child?.exists||!parent?.exists)fail('SETUP_REQUIRED');
 if(!parent.authorityIsWallet||!parent.disableCollateralSweep||!child.authorityIsWallet||!child.disableCollateralSweep||child.hasSplineLiquidity||child.spotCollateralCount||child.hasLockedDeposit)fail('ACCOUNT_POLICY');
 const positions=child.positions.filter(hasExposure);
 if(plan.close){
  const p=positions.find(p=>p.assetId===plan.market.assetId);
  if(positions.length!==1||!p||BigInt(p.baseLots)===0n||
     (BigInt(p.baseLots)<0n?-BigInt(p.baseLots):BigInt(p.baseLots))!==BigInt(plan.baseLots)||
     (BigInt(p.baseLots)>0n?'SHORT':'LONG')!==plan.side)fail('POSITION_CHANGED');
 }else{
  if(positions.length||child.quoteCollateralUnits!=='0'||child.withdrawalQueued||child.conditionalOrderCount)fail('ACCOUNT_IN_USE');
  if(!account.usdc.spendable||BigInt(account.usdc.amountUnits)<BigInt(plan.marginUsdcUnits))fail('INSUFFICIENT_USDC');
 }
 const addresses=[plan.walletAddress,material.checked.addresses.usdcAta,material.checked.addresses.canonicalAta,child.address];
 const minimumSlot=Math.max(account.observedSlot,native.observedSlot,plan.observedSlot);
 const feeReply=await request('getFeeForMessage',[wire.messageBase64,{commitment:account.commitment,minContextSlot:minimumSlot}]);
 if(!Number.isSafeInteger(feeReply?.context?.slot)||feeReply.context.slot<minimumSlot||!Number.isSafeInteger(feeReply.value)||feeReply.value<5000||feeReply.value>19000)fail('FEE');
 current();
 const reply=await request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,
  commitment:account.commitment,minContextSlot:minimumSlot,innerInstructions:true,accounts:{encoding:'base64',addresses}}]);
 current();
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot||!reply.value||reply.value.err!==null||
    !Array.isArray(reply.value.accounts)||reply.value.accounts.length!==addresses.length||
    !Number.isSafeInteger(reply.value.unitsConsumed)||reply.value.unitsConsumed<1||reply.value.unitsConsumed>wire.computeUnitLimit)fail('FAILED');
 const [payerRaw,usdcRaw,canonicalRaw,traderRaw]=reply.value.accounts;
 const postUsdc=decodePhoenixRpcToken(usdcRaw,{mint:ID.usdc,owner:plan.walletAddress});
 const postCanonical=decodePhoenixRpcToken(canonicalRaw,{mint:ID.canonicalUsdc,owner:plan.walletAddress});
 const postChild=decodePhoenixRpcTrader(traderRaw,{address:child.address,walletAddress:plan.walletAddress,index:plan.isolatedSubaccountIndex});
 if(!postChild.exists||
    !postChild.authorityIsWallet||postChild.disableCollateralSweep!==child.disableCollateralSweep||
    postChild.disablePositionAuthoritySwap!==child.disablePositionAuthoritySwap||postChild.maxPositions!==child.maxPositions||
    postChild.capabilityFlags!==child.capabilityFlags||postChild.spotCollateralCount!==child.spotCollateralCount||
    postChild.hasSplineLiquidity||postChild.hasLockedDeposit||postChild.conditionalOrderCount>child.conditionalOrderCount||
    (!child.withdrawalQueued&&postChild.withdrawalQueued))fail('ACCOUNT_EFFECTS');
 const sameTokenState=(a,b)=>a.exists===b.exists&&a.delegate===b.delegate&&a.closeAuthority===b.closeAuthority&&a.frozen===b.frozen;
 if(plan.close){
  if(!sameTokenState(postUsdc,account.usdc)||!sameTokenState(postCanonical,account.canonical))fail('TOKEN_EFFECTS');
 }else{
  if(!postUsdc.exists||!postUsdc.spendable||!postCanonical.exists||!postCanonical.spendable||!sameTokenState(postUsdc,account.usdc)||
     (account.canonical.exists&&!sameTokenState(postCanonical,account.canonical)))fail('TOKEN_EFFECTS');
 }
 if(BigInt(postCanonical.amountUnits)!==BigInt(account.canonical.amountUnits))fail('CANONICAL_CONSERVATION');
 const expectedUsdc=BigInt(account.usdc.amountUnits)-BigInt(plan.marginUsdcUnits);
 if(BigInt(postUsdc.amountUnits)!==expectedUsdc)fail('USDC_CONSERVATION');
 const postPositions=postChild.positions.filter(hasExposure);
 let protocolFeeUnits=null;
 if(plan.close){
  if(postPositions.length!==0||BigInt(postChild.quoteCollateralUnits)<0n)fail('CLOSE_INCOMPLETE');
 }else{
  const p=postPositions.find(p=>p.assetId===plan.market.assetId),lots=BigInt(plan.baseLots);
  if(postPositions.length!==1||!p||BigInt(p.baseLots)!==(plan.side==='LONG'?lots:-lots))fail('NO_FULL_FILL');
  const quote=BigInt(p.virtualQuoteLots),limit=lots*plan.packet.priceInTicks*BigInt(plan.market.tickSize);
  if((plan.side==='LONG'?(quote>=0n||-quote>limit):(quote<=0n||quote<limit))||
     (quote<0n?-quote:quote)>BigInt(plan.maxNotionalUsdcUnits))fail('PRICE_LIMIT');
  const charged=BigInt(plan.marginUsdcUnits)-BigInt(postChild.quoteCollateralUnits);
  const maximum=(BigInt(plan.maxNotionalUsdcUnits)*BigInt(native.takerFeeMicro)+999999n)/1000000n+1n;
  if(charged<0n||charged>maximum)fail('PROTOCOL_FEE');protocolFeeUnits=charged.toString();
 }
 const networkFee=integer(feeReply.value),payerBefore=BigInt(account.payerLamports),payerAfter=BigInt(decodePhoenixRpcPayer(payerRaw));
 const rent=payerBefore-payerAfter-networkFee;
 if(rent<0n||rent>(plan.close?0n:10000000n)||(!plan.close&&account.canonical.exists&&rent!==0n))fail('SOL_CONSERVATION');
 if(!plan.close&&!account.canonical.exists&&rent!==integer(canonicalRaw.lamports)-BigInt(account.canonical.uninitializedLamports))fail('RENT_CONSERVATION');
 if(plan.close&&payerAfter!==payerBefore-networkFee)fail('SOL_CONSERVATION');
 const message=getCompiledTransactionMessageDecoder().decode(Buffer.from(wire.messageBase64,'base64'));
 const order=message.instructions.at(-1);
 const resolved=await resolvedStaticKeys(message,request);
 const events=decodePhoenixOrderEvents({innerInstructions:reply.value.innerInstructions,staticAccountKeys:resolved,
  outerInstructionIndex:message.instructions.length-1,expected:{walletAddress:plan.walletAddress,traderAddress:child.address,
   symbol:plan.symbol,assetId:plan.market.assetId,tickSize:plan.market.tickSize,baseLotsDecimals:plan.market.baseLotsDecimals,
   slot:reply.context.slot,clientOrderId:plan.packet.clientOrderId.toString(),orderPacketBase64:Buffer.from(order.data).subarray(8).toString('base64')}});
 const fill=events.summary;
 if(events.outcome!=='FILLED'||!fill||fill.side!==plan.side||fill.baseLotsFilled!==plan.baseLots||
    fill.postQuoteCollateralUnits!==postChild.quoteCollateralUnits)fail('FILL_EVENTS');
 const actualPosition=postPositions[0];
 if(plan.close?(fill.postBaseLots!=='0'||fill.postVirtualQuoteLots!=='0'):
    (fill.postBaseLots!==actualPosition.baseLots||fill.postVirtualQuoteLots!==actualPosition.virtualQuoteLots||fill.feeUnits!==protocolFeeUnits))fail('FILL_EVENTS');
 const fillQuote=BigInt(fill.quoteLotsFilled),fillLimit=BigInt(plan.baseLots)*plan.packet.priceInTicks*BigInt(plan.market.tickSize);
 if(fillQuote<1n||(plan.side==='LONG'?fillQuote>fillLimit:fillQuote<fillLimit)||
    BigInt(fill.feeUnits)>(fillQuote*BigInt(native.takerFeeMicro)+999999n)/1000000n+1n)fail('FILL_EVENTS');
 protocolFeeUnits=fill.feeUnits;
 current();const elapsed=monotonicNow()-started;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||!Number.isSafeInteger(now()))fail('EXPIRED');
 const result=Object.freeze({stage:'PHOENIX_SIMULATED_ORDER',readyForSigning:false,walletAddress:plan.walletAddress,
  symbol:plan.symbol,close:plan.close,wireHash:wire.messageHash,observedSlot:reply.context.slot,
  observedAt:now(),expiresAt:wire.expiresAt,networkFeeLamports:networkFee.toString(),rentLockedLamports:rent.toString(),
  protocolFeeUnits,filledQuoteUnits:fill.quoteLotsFilled,nativeFillEventsVerified:true,postQuoteCollateralUnits:postChild.quoteCollateralUnits,
  requiresDurableReservation:true,requiresExplicitOwnerApproval:true,requiresFinalizedFillReconciliation:true});
 proofs.set(result,{wire,native,account,request,now,monotonicNow,started});return result;
}

export function requirePhoenixSimulatedOrder(value,{wire,request}={}){
 const p=proofs.get(value);if(!p||p.wire!==wire||(request&&p.request!==request))fail('UNVERIFIED');
 requirePhoenixUnsignedWire(wire);requireFreshPhoenixNativeMarket(p.native,{plan:requirePhoenixUnsignedWire(wire).review.plan,request:p.request});
 requireFreshPhoenixChainAccount(p.account,{walletAddress:value.walletAddress,request:p.request});
 const elapsed=p.monotonicNow()-p.started;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||p.now()>=value.expiresAt)fail('EXPIRED');
 return Object.freeze({...p,simulation:value});
}
