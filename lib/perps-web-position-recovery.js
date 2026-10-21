// Read-only recovery of an exact entry and its CURRENT finalized native state.
// This neither releases wallet risk nor proves complete daily accounting.
import {createHash} from 'node:crypto';
import {requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {readWebPerpsSubmissionReceipt} from './perps-web-broadcast.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {inspectServerPerpsBoundCore} from './perps-server-intent.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
import {decodeRecordedServerPerpsExit} from './perps-server-exits.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {PERPS_PROGRAM} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
function fail(){throw Error('WEB_PERPS_POSITION_NOT_VERIFIED');}
export function requireVerifiedWebPerpsPosition(value,{journal}={}){
 const proof=proofs.get(value);if(!proof||proof.journal!==journal)fail();proof.check();requireVerifiedServerPerpsTradeTransaction(proof.transaction);return value;
}
export async function readWebPerpsFinalizedPosition(reviewId,{journal,rpcRequest,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireWebPerpsSubmissionJournal(journal);
 if(typeof rpcRequest!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const row=journal.read(reviewId);if(!row)fail();
 const encoded=JSON.stringify(row),packet=JSON.parse(row.packet_json),draft=packet.review.draft,started=monotonicNow(),at=now();
 const check=()=>{const elapsed=monotonicNow()-started,clock=now();
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||!Number.isSafeInteger(clock)||clock<at||clock-at>10000||JSON.stringify(journal.read(reviewId))!==encoded)fail();
 };
 check();const receipt=await readWebPerpsSubmissionReceipt(reviewId,{journal,rpcRequest,now});check();
 if(receipt===null||receipt.state!=='CONFIRMED')return null;
 const transaction=await readServerPerpsTradeTransaction({walletAddress:row.wallet,signature:row.signature,day:receipt.executionDay},{request:rpcRequest,now,monotonicNow});check();
 if(transaction.slot!==receipt.slot||transaction.failed||transaction.unknownPerpsEvents||transaction.events.length!==1)fail();
 const historical=readVerifiedPerpsTransactionEvidence(transaction),wire=Buffer.from(historical.wire,'base64');wire.fill(0,65,129);
 if(createHash('sha256').update(wire).digest('hex')!==row.wire_hash)fail();
 const intent={walletAddress:row.wallet,asset:draft.asset,side:draft.side,marginUsd:draft.margin,leverage:draft.leverage,
  referencePrice:draft.referencePrice,stopLoss:draft.stopLoss??null,takeProfit:draft.takeProfit??null,maxSlippageBps:50};
 const envelope=decodeServerPerpsEnvelope(packet.preparation.serializedTxBase64,row.wallet);
 const core=inspectServerPerpsBoundCore(envelope,historical.keys,intent,Math.floor(packet.review.observedAt/1000));
 if(core.sizeUsdUnits!==packet.review.sizeUsdUnits)fail();
 const exits=[];
 for(const ix of envelope.instructions){
  if(envelope.staticKeys[ix.program]!==PERPS_PROGRAM)continue;
  const data=Buffer.from(ix.dataBase64,'base64');if(data.subarray(0,8).toString('hex')!=='7562427f1e3249b9')continue;
  exits.push({address:historical.keys[ix.accounts[7]],kind:(data[32]===1)===(draft.side==='LONG')?'TP':'SL',sizeUsdUnits:data.readBigUInt64LE(16).toString(),
   triggerPriceUsdUnits:data.readBigUInt64LE(24).toString(),counter:data.readBigUInt64LE(34).toString()});
 }
 const entryExitPlan=canonicalServerPerpsEntryExitPlan({sizeUsdUnits:core.sizeUsdUnits,exits}),plan=JSON.parse(entryExitPlan),event=transaction.events[0];
 if(event.action!=='Increase'||event.asset!==draft.asset||event.side!==draft.side||event.positionAddress!==packet.preparation.positionPubkey
  ||event.fields.sizeUsdDelta!==core.sizeUsdUnits||event.instructionIndex!==envelope.instructions.findIndex(ix=>envelope.staticKeys[ix.program]===PERPS_PROGRAM
   &&Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='a47e44b6dfa640b7'))fail();
 const size=BigInt(event.fields.sizeUsdDelta),collateral=BigInt(event.fields.collateralUsdDelta),margin=BigInt(exactUsdUnits(draft.margin));
 const [whole,fraction='0']=draft.leverage.split('.'),leverage=BigInt(whole)*10n+BigInt(fraction);
 if(collateral<=0n||collateral>margin||size*100000n>collateral*leverage*10050n||size*100000n<collateral*leverage*9950n)fail();
 if(await rpcRequest('getGenesisHash',[])!==genesis)fail();check();
 const addresses=[packet.preparation.positionPubkey,...plan.exits.map(exit=>exit.address)];
 const response=await rpcRequest('getMultipleAccounts',[addresses,{commitment:'finalized',encoding:'base64',minContextSlot:receipt.slot}]);check();
 if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<receipt.slot||!Array.isArray(response.value)||response.value.length!==addresses.length)fail();
 const position=await decodeServerPerpsPosition(addresses[0],response.value[0],intent);check();
 if(position.sizeUsdUnits!==event.fields.positionSizeUsd||BigInt(position.sizeUsdUnits)<size||BigInt(position.collateralUsdUnits)<collateral
  ||position.openTimeSeconds!==event.fields.openTime||BigInt(position.updateTimeSeconds)<BigInt(transaction.blockTime)
  ||BigInt(position.updateTimeSeconds)>BigInt(Math.floor(now()/1000)+2))fail();
 const verifiedExits=[];
 for(let i=0;i<plan.exits.length;i++){verifiedExits.push(await decodeRecordedServerPerpsExit(plan.exits[i],response.value[i+1],intent));check();}
 if(await rpcRequest('getGenesisHash',[])!==genesis)fail();check();
 const value=Object.freeze({stage:'WEB_PERPS_FINALIZED_ENTRY_AND_CURRENT_POSITION',reviewId,walletAddress:row.wallet,signature:row.signature,
  positionAddress:position.address,entrySlot:receipt.slot,observedSlot:response.context.slot,observedAt:now(),position,entryExitPlan,exits:Object.freeze(verifiedExits),
  entrySizeUsdUnits:core.sizeUsdUnits,entryCollateralUsdUnits:collateral.toString(),entryFeeUsdUnits:event.feeUsdUnits,
  readyForSigning:false,tradingEnabled:false,requiresFinancialLedgerIntegration:true,requiresReconciledDailyAccounting:true});
 proofs.set(value,{journal,transaction,check});requireVerifiedWebPerpsPosition(value,{journal});
 journal.recordPositionObservation(value);
 return requireVerifiedWebPerpsPosition(value,{journal});
}
