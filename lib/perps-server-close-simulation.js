// Exact-wire position/recipient effects only. Pool/oracle state changes, rent,
// token setup, durable close accounting and signing authority are separate gates.
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsFullClosePlanPosition} from './perps-server-close-intent.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
import {readPerpsCancellationUsdcBalance} from './perps-exit-cancellation-simulation.js';
import {readServerPerpsCloseOracleContext,CLOSE_PYTH_LAZER} from './perps-close-oracle-context.js';
import bs58 from 'bs58';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_SIMULATION');}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function vacant(account){return account===null||account.owner===SYSTEM&&!account.executable&&account.data[0]==='';}
function closed(account){return vacant(account)&&(account===null||account.lamports==='0');}
export function readServerPerpsFullCloseSimulation(value){
 const proof=proofs.get(value);if(!proof)fail();readInspectedServerPerpsFullClose(proof.inspection);return proof;
}
export async function simulateServerPerpsFullCloseEffects(inspection,{request,monotonicNow=()=>performance.now(),minimumSlot=inspection?.observedSlot,oracleContext=null}={}){
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
 // A collateral-only close need not reference the USDC ATA/custody at all.
 // Sample them as read-only evidence too: pre-existing USDC must not become
 // alleged proceeds and custody accounting still uses one confirmed bank.
 for(const address of [bindings.recipient,bindings.collateralAccount,...[evidence.market,evidence.collateral,evidence.usdc].flatMap(c=>[c.address,c.tokenAccount])])if(!addresses.includes(address))addresses.push(address);
 if(oracleContext!==null){
  readServerPerpsCloseOracleContext(oracleContext,inspection);
  if(minimumSlot<oracleContext.observedSlot)fail();
  // Read-only oracle accounts must be sampled in the SAME before/simulated
  // bank too; an earlier configuration fetch is not price-effect evidence.
  for(const key of oracleContext.feeds.flatMap(f=>[f.address,f.lazerFeed]))if(!addresses.includes(key))addresses.push(key);
  if(!addresses.includes(CLOSE_PYTH_LAZER.storage))addresses.push(CLOSE_PYTH_LAZER.storage);
 }
 if(addresses.length>100||new Set(addresses).size!==addresses.length||![plan.walletAddress,plan.positionAddress,bindings.recipient].every(address=>addresses.includes(address)))fail();
 Object.freeze(addresses);
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimumSlot}]));if(slot<minimumSlot)fail();
 const height=async()=>{const h=integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}]));if(BigInt(h)>BigInt(evidence.lastValidBlockHeight))fail();};
 await height();
 const feeReply=await request('getFeeForMessage',[Buffer.from(wire,'base64').subarray(193).toString('base64'),{commitment:'confirmed',minContextSlot:slot}]);
 const feeSlot=integer(feeReply?.context?.slot);if(feeSlot<slot)fail();slot=feeSlot;
 const fee=integer(feeReply.value);if(fee<1||fee>1000000||BigInt(fee)<BigInt(bindings.capabilities.priorityFeeLamports))fail();
 let before,after,units,bankAttempts=0;
 // minContextSlot is a lower bound, not a snapshot pin. Comparing different
 // banks would mix other traders' vault/exposure changes into this close.
 // Pair confirmed-bank reads concurrently and discard both if slots differ.
 // These are at most three READ-ONLY attempts of the same unsigned wire, not
 // transaction-send retries, new builders, replacement blockhashes or signatures.
 for(let attempt=0;attempt<3;attempt++){
  readInspectedServerPerpsFullClose(inspection);
  const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
  const [reply,response]=await Promise.all([
   request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:slot}]),
   request('simulateTransaction',[wire,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}])
  ]);
  bankAttempts++;
  const beforeSlot=integer(reply?.context?.slot),simulatedSlot=integer(response?.context?.slot);
  if(beforeSlot<slot||simulatedSlot<slot)fail();
  const value=response?.value;if(!value||value.err!==null||value.replacementBlockhash!=null)fail();
  units=integer(value.unitsConsumed);if(units<1||BigInt(units)>BigInt(bindings.capabilities.computeUnitLimit))fail();
  const previous=canonicalServerPerpsSimulationSnapshot(addresses,reply.value),next=canonicalServerPerpsSimulationSnapshot(addresses,value.accounts);
  slot=Math.max(beforeSlot,simulatedSlot);
  if(beforeSlot!==simulatedSlot)continue;
  before=previous;after=next;break;
 }
 if(!before||!after)throw Error('PERPS_CLOSE_SNAPSHOT_BANK_CHANGED');
 const oldPosition=await decodeServerPerpsPosition(plan.positionAddress,before[plan.positionAddress],plan);
 if(JSON.stringify(oldPosition)!==JSON.stringify(readServerPerpsFullClosePlanPosition(plan)))fail();
 const oldRecipient=before[bindings.recipient],oldTokens=vacant(oldRecipient)?0n:readPerpsCancellationUsdcBalance(oldRecipient,plan.walletAddress);
 if(!closed(after[plan.positionAddress])){
  const next=await decodeServerPerpsPosition(plan.positionAddress,after[plan.positionAddress],plan);
  if(next.sizeUsdUnits!=='0'||next.collateralUsdUnits!=='0'||next.lockedTokenUnits!=='0'||next.realisedPnlUsdUnits!=='0'
   ||BigInt(next.updateTimeSeconds)<BigInt(oldPosition.updateTimeSeconds))fail();
 }
 const received=(vacant(after[bindings.recipient])?0n:readPerpsCancellationUsdcBalance(after[bindings.recipient],plan.walletAddress))-oldTokens;
 if(received<0n)fail(); // Zero proceeds can be a complete loss, never invent a payout.
 let receivedCollateral=0n;
 if(plan.requiresSeparateUsdcConversion){
  if(received!==0n)fail();
  // The next gates independently bind the vault's authority, token metadata,
  // SOL/rent equation and wallet token increment to this exact debit.
  const vaultAmount=account=>{
   if(!account||account.owner!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')fail();
   const b=Buffer.from(account.data[0],'base64');
   if(b.length!==165||bs58.encode(b.subarray(0,32))!==evidence.collateral.mint)fail();
   return b.readBigUInt64LE(64);
  };
  receivedCollateral=vaultAmount(before[evidence.collateral.tokenAccount])-vaultAmount(after[evidence.collateral.tokenAccount]);
  if(receivedCollateral<0n)fail();
 }
 if(bindings.swapMinimumOutUsdcUnits!==null&&received<BigInt(bindings.swapMinimumOutUsdcUnits))fail();
 await height();if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 readInspectedServerPerpsFullClose(inspection);
 const result=Object.freeze({stage:'FULL_CLOSE_POSITION_AND_RECIPIENT_SIMULATED',readyForSigning:false,tradingEnabled:false,
  walletAddress:plan.walletAddress,positionAddress:plan.positionAddress,observedSlot:slot,feeLamports:String(fee),
  unitsConsumed:String(units),receivedUsdcUnits:received.toString(),receivedCollateralUnits:receivedCollateral.toString(),
  collateralAsset:evidence.collateral.asset,requiresSeparateUsdcConversion:plan.requiresSeparateUsdcConversion,
  snapshotBankAttempts:bankAttempts,requiresFullInstructionPolicy:true,
  requiresFundingRentAndOtherAccountChecks:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({inspection,wire,addresses,before,after,beforeSlot:slot,simulationSlot:slot}));return result;
}
