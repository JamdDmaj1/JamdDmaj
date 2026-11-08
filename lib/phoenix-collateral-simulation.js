// Exact split-settlement wire and read-only effect checks. This is neither
// finalized payout evidence nor authorization to spend a canonical balance.
import {createHash} from 'node:crypto';
import {createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,
 appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction} from '@solana/kit';
import {requirePhoenixCollateralPreparation} from './phoenix-collateral.js';
import {decodePhoenixRpcToken,decodePhoenixRpcTrader,decodePhoenixRpcPayer} from './phoenix-chain-account.js';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
const COMPUTE='ComputeBudget111111111111111111111111111111';
const wires=new WeakMap(),simulations=new WeakMap();
const fail=code=>{throw Error('PHOENIX_COLLATERAL_SIMULATION_'+code);};
const unit=v=>{if(!Number.isSafeInteger(v)||v<0)fail('RESPONSE');return BigInt(v);};
export function buildPhoenixCollateralWire(preparation,{blockhash,lastValidBlockHeight,computeUnitLimit=300000,computeUnitPriceMicroLamports=1000}={}){
 requirePhoenixCollateralPreparation(preparation);phoenixKey(blockhash);
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1||!Number.isInteger(computeUnitLimit)||computeUnitLimit<100000||computeUnitLimit>1000000||
    !Number.isInteger(computeUnitPriceMicroLamports)||computeUnitPriceMicroLamports<0||computeUnitPriceMicroLamports>10000)fail('BUDGET');
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(computeUnitLimit,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(BigInt(computeUnitPriceMicroLamports),1);
 const instructions=[{programAddress:COMPUTE,accounts:[],data:limit},{programAddress:COMPUTE,accounts:[],data:price},
  ...preparation.instructions.map(i=>({...i,data:Uint8Array.from(i.data)}))];
 let message=createTransactionMessage({version:'legacy'});message=setTransactionMessageFeePayer(preparation.walletAddress,message);
 message=setTransactionMessageLifetimeUsingBlockhash({blockhash,lastValidBlockHeight:BigInt(lastValidBlockHeight)},message);
 message=appendTransactionMessageInstructions(instructions,message);const compiled=compileTransaction(message);
 const serializedTxBase64=getBase64EncodedWireTransaction(compiled),raw=Buffer.from(serializedTxBase64,'base64');
 if(raw.length>1232||raw[0]!==1||raw.subarray(1,65).some(b=>b!==0))fail('WIRE');
 requirePhoenixCollateralPreparation(preparation);
 const result=Object.freeze({stage:'PHOENIX_COLLATERAL_WIRE',phase:preparation.phase,walletAddress:preparation.walletAddress,serializedTxBase64,
  messageBase64:Buffer.from(compiled.messageBytes).toString('base64'),messageHash:createHash('sha256').update(compiled.messageBytes).digest('hex'),
  lastValidBlockHeight,blockhash,computeUnitLimit,computeUnitPriceMicroLamports,readyForSigning:false});
 wires.set(result,{preparation});return result;
}
export function requirePhoenixCollateralWire(value){const p=wires.get(value);if(!p)fail('UNVERIFIED');const proof=requirePhoenixCollateralPreparation(p.preparation);return Object.freeze({...proof,wire:value});}
function sameTrader(a,b){
 return b.exists&&b.authorityIsWallet&&b.disableCollateralSweep===a.disableCollateralSweep&&b.disablePositionAuthoritySwap===a.disablePositionAuthoritySwap&&
  b.capabilityFlags===a.capabilityFlags&&b.maxPositions===a.maxPositions&&!b.hasSplineLiquidity&&!b.spotCollateralCount&&!b.hasLockedDeposit&&!b.conditionalOrderCount&&
  b.positions.every(p=>p.baseLots==='0'&&p.virtualQuoteLots==='0');
}
export async function simulatePhoenixCollateral(wire,{request}={}){
 const p=requirePhoenixCollateralWire(wire),{preparation:prep,account}=p;
 if(typeof request!=='function'||request!==p.request)fail('INPUT');
 const child=account.subaccounts.find(s=>s.subaccountIndex===prep.subaccountIndex),wallet=prep.walletAddress,a=prep.addresses;
 const addresses=[wallet,a.usdcAta,a.canonicalAta,a.trader],minimumSlot=prep.observedSlot;
 const fee=await request('getFeeForMessage',[wire.messageBase64,{commitment:account.commitment,minContextSlot:minimumSlot}]);
 if(!Number.isSafeInteger(fee?.context?.slot)||fee.context.slot<minimumSlot||!Number.isSafeInteger(fee.value)||fee.value<5000||fee.value>15000)fail('FEE');
 requirePhoenixCollateralWire(wire);
 const reply=await request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,
  commitment:account.commitment,minContextSlot:minimumSlot,accounts:{encoding:'base64',addresses}}]);
 requirePhoenixCollateralWire(wire);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot||!reply.value||reply.value.err!==null||
    !Array.isArray(reply.value.accounts)||reply.value.accounts.length!==4||!Number.isSafeInteger(reply.value.unitsConsumed)||reply.value.unitsConsumed<1||reply.value.unitsConsumed>wire.computeUnitLimit)fail('FAILED');
 const [payerRaw,usdcRaw,canonicalRaw,traderRaw]=reply.value.accounts;
 const usdc=decodePhoenixRpcToken(usdcRaw,{mint:ID.usdc,owner:wallet}),canonical=decodePhoenixRpcToken(canonicalRaw,{mint:ID.canonicalUsdc,owner:wallet});
 const after=decodePhoenixRpcTrader(traderRaw,{address:a.trader,walletAddress:wallet,index:prep.subaccountIndex});
 if(!sameTrader(child,after))fail('TRADER_EFFECTS');
 const amount=BigInt(prep.amountUnits),oldQuote=BigInt(child.quoteCollateralUnits),newQuote=BigInt(after.quoteCollateralUnits);
 const beforeCanonical=BigInt(account.canonical.amountUnits),afterCanonical=BigInt(canonical.amountUnits),beforeUsdc=BigInt(account.usdc.amountUnits),afterUsdc=BigInt(usdc.amountUnits);
 const unchangedToken=(b,c)=>b.exists===c.exists&&b.delegate===c.delegate&&b.closeAuthority===c.closeAuthority&&b.frozen===c.frozen;
 let queued=false;
 if(prep.phase==='WITHDRAW'){
  if(!unchangedToken(account.usdc,usdc)||afterUsdc!==beforeUsdc||!canonical.spendable||
     account.canonical.exists&&!unchangedToken(account.canonical,canonical))fail('TOKEN_EFFECTS');
  queued=after.withdrawalQueued;
  if(queued){
   // A queue ticket is not spendable wallet cash. Some native states retain
   // reserved quote collateral; neither representation may be credited twice.
   if(afterCanonical!==beforeCanonical||![0n,oldQuote].includes(newQuote))fail('QUEUE_EFFECTS');
  }else if(newQuote!==0n||afterCanonical-beforeCanonical!==amount||oldQuote!==amount)fail('WITHDRAW_CONSERVATION');
 }else{
  if(after.withdrawalQueued||newQuote!==0n||!canonical.spendable||!usdc.spendable||
     !unchangedToken(account.canonical,canonical)||account.usdc.exists&&!unchangedToken(account.usdc,usdc)||
     beforeCanonical-afterCanonical!==amount||afterUsdc-beforeUsdc!==amount)fail('UNWRAP_CONSERVATION');
 }
 const rent=BigInt(account.payerLamports)-BigInt(decodePhoenixRpcPayer(payerRaw))-BigInt(fee.value);
 const created=prep.phase==='WITHDRAW'?!account.canonical.exists:!account.usdc.exists;
 const raw=prep.phase==='WITHDRAW'?canonicalRaw:usdcRaw,before=prep.phase==='WITHDRAW'?account.canonical:account.usdc;
 if(rent<0n||rent>10000000n||rent!==(created?unit(raw.lamports)-BigInt(before.uninitializedLamports):0n))fail('SOL_CONSERVATION');
 requirePhoenixCollateralWire(wire);
 const result=Object.freeze({stage:'PHOENIX_COLLATERAL_SIMULATED',phase:prep.phase,walletAddress:wallet,amountUnits:prep.amountUnits,
  observedSlot:reply.context.slot,wireHash:wire.messageHash,networkFeeLamports:String(fee.value),rentLockedLamports:rent.toString(),
  payoutQueued:queued,walletCredited:false,requiresFinalizedReconciliation:true,requiresFinalizedPayoutBinding:prep.phase==='UNWRAP',readyForSigning:false});
 simulations.set(result,{wire,request});return result;
}
export function requirePhoenixCollateralSimulation(value,{wire,request}={}){
 const p=simulations.get(value);if(!p||p.wire!==wire||(request&&request!==p.request))fail('UNVERIFIED');requirePhoenixCollateralWire(wire);return Object.freeze({...p,simulation:value});
}
