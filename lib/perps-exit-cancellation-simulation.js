// Exact-wire read-only cancellation simulation. This grants no signing, funding,
// activation, retry or journal closure authority, even when all checks pass.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {readInspectedPerpsExitCancellationEvidence,requireInspectedPerpsExitCancellation} from './perps-exit-cancellation.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {decodeRecordedServerPerpsExit} from './perps-server-exits.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES} from './perps-server-custody.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const simulations=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CANCELLATION_SIMULATION');}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function vacant(account){return account===null||account.owner===SYSTEM&&!account.executable&&account.data[0]==='';}
function closed(account){return vacant(account)&&(account===null||account.lamports==='0');}
function payer(account){if(!account||account.owner!==SYSTEM||bytes(account).length!==0)fail();return BigInt(account.lamports);}
function token(account,owner){
 const b=bytes(account);if(account.owner!==TOKEN||b.length!==165||bs58.encode(b.subarray(0,32))!==PERPS_CUSTODIES.USDC.mint
  ||bs58.encode(b.subarray(32,64))!==owner||b[108]!==1||b.readUInt32LE(72)!==0||b.readUInt32LE(109)!==0||b.readBigUInt64LE(121)!==0n)fail();
 const close=b.readUInt32LE(129);if(close>1||close===1&&bs58.encode(b.subarray(133,165))!==owner)fail();
 return b.readBigUInt64LE(64);
}
export function requireSimulatedPerpsExitCancellation(value){
 const proof=simulations.get(value);if(!proof)fail();requireInspectedPerpsExitCancellation(proof.inspection);return value;
}
export async function simulateServerPerpsExitCancellation(inspection,{request,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const evidence=readInspectedPerpsExitCancellationEvidence(inspection),{envelope,resolvedKeys:keys}=inspection;
 const wire=envelope.serializedTxBase64,addresses=[];
 for(let i=0;i<keys.length;i++){
  const writable=i<3?i<3-envelope.readonlySigned:i<envelope.staticKeys.length?i<envelope.staticKeys.length-envelope.readonlyUnsigned
   :i<envelope.staticKeys.length+envelope.lookups.reduce((n,table)=>n+table.writable.length,0);
  if(writable)addresses.push(keys[i]);
 }
 if(!addresses.includes(inspection.positionAddress))addresses.push(inspection.positionAddress);
 if(addresses.length>10||new Set(addresses).size!==addresses.length)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:inspection.observedSlot}]));if(slot<inspection.observedSlot)fail();
 const height=async()=>{const current=integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}]));if(BigInt(current)>BigInt(evidence.lastValidBlockHeight))fail();};
 await height();
 const beforeReply=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:slot}]);
 const beforeSlot=integer(beforeReply?.context?.slot);if(beforeSlot<slot)fail();slot=beforeSlot;
 const before=canonicalServerPerpsSimulationSnapshot(addresses,beforeReply.value);
 await decodeRecordedServerPerpsExit(evidence.pending,before[inspection.exitAddress],evidence.intent);
 const pool=before[PERPS_POOL];if(pool?.owner!==PERPS_PROGRAM||!bytes(pool).subarray(0,8).equals(createHash('sha256').update('account:Pool').digest().subarray(0,8)))fail();
 if(!closed(before[inspection.positionAddress]))await decodeServerPerpsPosition(inspection.positionAddress,before[inspection.positionAddress],evidence.intent);
 const owner=inspection.walletAddress,ownerAta=inspection.ownerAta,requestAta=inspection.requestAta;
 const requestBalance=token(before[requestAta],inspection.exitAddress),oldOwner=before[ownerAta];
 const oldTokens=vacant(oldOwner)?0n:token(oldOwner,owner);
 const feeReply=await request('getFeeForMessage',[Buffer.from(wire,'base64').subarray(193).toString('base64'),{commitment:'confirmed',minContextSlot:slot}]);
 const feeSlot=integer(feeReply?.context?.slot);if(feeSlot<slot)fail();slot=feeSlot;
 const fee=integer(feeReply.value);if(fee<1||fee>1000000||BigInt(fee)<BigInt(inspection.capabilities.priorityFeeLamports))fail();
 const response=await request('simulateTransaction',[wire,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}]);
 const simulationSlot=integer(response?.context?.slot);if(simulationSlot<slot)fail();slot=simulationSlot;
 const value=response?.value;if(!value||value.err!==null||value.replacementBlockhash!=null)fail();
 const consumed=integer(value.unitsConsumed);if(consumed<1||BigInt(consumed)>BigInt(inspection.capabilities.computeUnitLimit))fail();
 const after=canonicalServerPerpsSimulationSnapshot(addresses,value.accounts);
 if(!closed(after[inspection.exitAddress])||!closed(after[requestAta])||token(after[ownerAta],owner)!==oldTokens+requestBalance)fail();
 let addedRent=0n;
 if(vacant(oldOwner)){
  const minimum=integer(await request('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));if(minimum<1||minimum>10000000)fail();
  const oldLamports=BigInt(oldOwner?.lamports??'0'),required=oldLamports>BigInt(minimum)?oldLamports:BigInt(minimum);
  if(BigInt(after[ownerAta].lamports)!==required)fail();addedRent=required-oldLamports;
 }else{
  const oldData=bytes(oldOwner),nextData=bytes(after[ownerAta]);nextData.writeBigUInt64LE(oldTokens,64);
  if(!nextData.equals(oldData)||oldOwner.lamports!==after[ownerAta].lamports)fail();
 }
 const recoveredRent=BigInt(before[inspection.exitAddress].lamports)+BigInt(before[requestAta].lamports);
 if(payer(after[owner])!==payer(before[owner])+recoveredRent-BigInt(fee)-addedRent)fail();
 for(const address of addresses){
  if([owner,ownerAta,inspection.exitAddress,requestAta].includes(address))continue;
  if(!same(before[address],after[address]))fail();
 }
 if(!Object.hasOwn(before,PERPS_POOL)||!Object.hasOwn(before,inspection.positionAddress))fail();
 await height();if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 requireInspectedPerpsExitCancellation(inspection);
 const result=Object.freeze({stage:'EXIT_CANCELLATION_SIMULATED_NOT_AUTHORIZED',walletAddress:owner,reservationId:inspection.reservationId,exitAddress:inspection.exitAddress,
  observedSlot:slot,feeLamports:String(fee),returnedUsdcUnits:requestBalance.toString(),recoveredRentLamports:recoveredRent.toString(),addedOwnerAtaRentLamports:addedRent.toString(),
  readyForSigning:false,requiresFreshCleanupProof:true,requiresDurableCancellationRecord:true,requiresFinalizedAbsence:true});
 simulations.set(result,Object.freeze({inspection}));return requireSimulatedPerpsExitCancellation(result);
}
