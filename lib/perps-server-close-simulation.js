// Exact-wire position/recipient effects only. Pool/oracle state changes, rent,
// token setup, durable close accounting and signing authority are separate gates.
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsFullClosePlanPosition} from './perps-server-close-intent.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
import {readPerpsCancellationUsdcBalance} from './perps-exit-cancellation-simulation.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_SIMULATION');}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function vacant(account){return account===null||account.owner===SYSTEM&&!account.executable&&account.data[0]==='';}
function closed(account){return vacant(account)&&(account===null||account.lamports==='0');}
export function readServerPerpsFullCloseSimulation(value){
 const proof=proofs.get(value);if(!proof)fail();readInspectedServerPerpsFullClose(proof.inspection);return proof;
}
export async function simulateServerPerpsFullCloseEffects(inspection,{request,monotonicNow=()=>performance.now(),minimumSlot=inspection?.observedSlot}={}){
 if(typeof request!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const evidence=readInspectedServerPerpsFullClose(inspection),{plan}=evidence;
 if(!Number.isSafeInteger(minimumSlot)||minimumSlot<inspection.observedSlot)fail();
 const {envelope,resolvedKeys:keys,bindings}=inspection,wire=envelope.serializedTxBase64,addresses=[];
 const loadedWritable=envelope.lookups.reduce((sum,table)=>sum+table.writable.length,0);
 for(let i=0;i<keys.length;i++){
  const writable=i<3?i<3-envelope.readonlySigned:i<envelope.staticKeys.length?i<envelope.staticKeys.length-envelope.readonlyUnsigned:i<envelope.staticKeys.length+loadedWritable;
  if(writable)addresses.push(keys[i]);
 }
 if(addresses.length>100||new Set(addresses).size!==addresses.length||![plan.walletAddress,plan.positionAddress,bindings.recipient].every(address=>addresses.includes(address)))fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimumSlot}]));if(slot<minimumSlot)fail();
 const height=async()=>{const h=integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}]));if(BigInt(h)>BigInt(evidence.lastValidBlockHeight))fail();};
 await height();
 const reply=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:slot}]);
 const beforeSlot=integer(reply?.context?.slot);if(beforeSlot<slot)fail();slot=beforeSlot;
 const before=canonicalServerPerpsSimulationSnapshot(addresses,reply.value);
 const oldPosition=await decodeServerPerpsPosition(plan.positionAddress,before[plan.positionAddress],plan);
 if(JSON.stringify(oldPosition)!==JSON.stringify(readServerPerpsFullClosePlanPosition(plan)))fail();
 const oldRecipient=before[bindings.recipient],oldTokens=vacant(oldRecipient)?0n:readPerpsCancellationUsdcBalance(oldRecipient,plan.walletAddress);
 const feeReply=await request('getFeeForMessage',[Buffer.from(wire,'base64').subarray(193).toString('base64'),{commitment:'confirmed',minContextSlot:slot}]);
 const feeSlot=integer(feeReply?.context?.slot);if(feeSlot<slot)fail();slot=feeSlot;
 const fee=integer(feeReply.value);if(fee<1||fee>1000000||BigInt(fee)<BigInt(bindings.capabilities.priorityFeeLamports))fail();
 const response=await request('simulateTransaction',[wire,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}]);
 const simulatedSlot=integer(response?.context?.slot);if(simulatedSlot<slot)fail();slot=simulatedSlot;
 const value=response?.value;if(!value||value.err!==null||value.replacementBlockhash!=null)fail();
 const units=integer(value.unitsConsumed);if(units<1||BigInt(units)>BigInt(bindings.capabilities.computeUnitLimit))fail();
 const after=canonicalServerPerpsSimulationSnapshot(addresses,value.accounts);
 if(!closed(after[plan.positionAddress])){
  const next=await decodeServerPerpsPosition(plan.positionAddress,after[plan.positionAddress],plan);
  if(next.sizeUsdUnits!=='0'||next.collateralUsdUnits!=='0'||BigInt(next.updateTimeSeconds)<BigInt(oldPosition.updateTimeSeconds))fail();
 }
 const received=readPerpsCancellationUsdcBalance(after[bindings.recipient],plan.walletAddress)-oldTokens;
 if(received<0n)fail(); // Zero proceeds can be a complete loss, never invent a payout.
 if(bindings.swapMinimumOutUsdcUnits!==null&&received<BigInt(bindings.swapMinimumOutUsdcUnits))fail();
 await height();if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 readInspectedServerPerpsFullClose(inspection);
 const result=Object.freeze({stage:'FULL_CLOSE_POSITION_AND_RECIPIENT_SIMULATED',readyForSigning:false,tradingEnabled:false,
  walletAddress:plan.walletAddress,positionAddress:plan.positionAddress,observedSlot:slot,feeLamports:String(fee),
  unitsConsumed:String(units),receivedUsdcUnits:received.toString(),requiresFullInstructionPolicy:true,
  requiresFundingRentAndOtherAccountChecks:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({inspection,wire,addresses:Object.freeze(addresses),before,after}));return result;
}
