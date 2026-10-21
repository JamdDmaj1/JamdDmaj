// Exact-bank oracle price/configuration effects. This is not Pyth payload
// provenance, full protocol economics, minimum-payout protection or authority
// to sign. Successful simulation must execute the bound oracle programs too.
import {readServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {readServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readServerPerpsFullClosePolicy} from './perps-server-close-policy.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsCloseOracleContext,CLOSE_DOVES_PROGRAM} from './perps-close-oracle-context.js';
import {PERPS_PYTH_LAZER,requireUnchangedPerpsPythStorage} from './perps-pyth-storage.js';
import {readSignedPerpsPythPayload,requirePerpsPythFeed} from './perps-pyth-payload.js';
import {comparePerpsDovesLazerConfiguration,checkPerpsDovesLazerEffects} from './perps-doves-lazer-effects.js';
const proofs=new WeakMap();
function fail(reason=''){throw Error('UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS'+(reason?'_'+reason:''));}
function bytes(a){
 if(!a||a.owner!==CLOSE_DOVES_PROGRAM||a.executable)fail();
 const b=Buffer.from(a.data[0],'base64');if(b.length>4096||b.toString('base64')!==a.data[0])fail();return b;
}
function sameConfiguration(a,b,offset){
 const x=bytes(a),y=bytes(b);
 if(x.length<offset+17||x.length!==y.length||a.lamports!==b.lamports||!x.subarray(0,offset).equals(y.subarray(0,offset))||!x.subarray(offset+17).equals(y.subarray(offset+17)))fail('CONFIGURATION');
 return [x,y];
}
function price(data,offset){
 const raw=data.readBigUInt64LE(offset),expo=data.readInt8(offset+8),timestamp=data.readBigInt64LE(offset+9);
 if(raw===0n||expo< -18||expo>0||timestamp<0n)fail();
 const shift=6+expo,denominator=shift<0?10n**BigInt(-shift):1n,numerator=shift>=0?raw*10n**BigInt(shift):raw;
 return {lower:numerator/denominator,upper:(numerator+denominator-1n)/denominator,timestamp};
}
function fresh(value,maxAge,now){
 if(!Number.isSafeInteger(maxAge)||maxAge<1||maxAge>3600)fail('MAX_AGE');
 if(value.timestamp>BigInt(now)+2n)fail('FUTURE');
 if(value.timestamp<BigInt(now)-BigInt(maxAge))fail('STALE');
}
export function readServerPerpsFullCloseOracleEffects(value){
 const p=proofs.get(value);if(!p)fail();readServerPerpsFullCloseReserves(p.reserves);return p;
}
export function checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds}={}){
 if(!Number.isSafeInteger(nowSeconds)||nowSeconds<30)fail();
 const {vaults}=readServerPerpsFullCloseReserves(reserves),{funding,policy}=readServerPerpsFullCloseVaults(vaults);
 const {simulation}=readServerPerpsFullCloseFunding(funding),{inspection,before,after,beforeSlot,simulationSlot}=readServerPerpsFullCloseSimulation(simulation);
 const {oracleContext}=readServerPerpsFullClosePolicy(policy),context=readServerPerpsCloseOracleContext(oracleContext,inspection);
 const {plan,market}=readInspectedServerPerpsFullClose(inspection);
 if(beforeSlot!==simulationSlot||beforeSlot!==simulation.observedSlot||beforeSlot<oracleContext.observedSlot)fail();
 const storage=requireUnchangedPerpsPythStorage(context.pythStorage,before[PERPS_PYTH_LAZER.storage],after[PERPS_PYTH_LAZER.storage]);
 const signedFeeds=new Map();
 for(let i=0;i<inspection.envelope.instructions.length;i++){
  const ix=inspection.envelope.instructions[i];
  if(inspection.resolvedKeys[ix.program]===CLOSE_DOVES_PROGRAM&&Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='cb3b5fb0ec154999'){
   const payload=readSignedPerpsPythPayload(inspection.envelope.instructions,inspection.resolvedKeys,i,{storage,nowSeconds});
   for(const keyIndex of ix.accounts.slice(6)){
    const key=inspection.resolvedKeys[keyIndex],native=bytes(context.extra[key]);
    if(signedFeeds.has(key))fail('DUPLICATE_SIGNED_UPDATE');
    signedFeeds.set(key,requirePerpsPythFeed(payload,native.readUInt32LE(91),native[95]));
   }
  }
 }
 const prices=[];
 for(const feed of oracleContext.feeds){
  const prior=before[feed.address],next=after[feed.address];
  // The privately derived feed/mint/configuration cannot be replaced between
  // its context fetch, the bank snapshot and simulated execution.
  sameConfiguration(context.agSnapshot[feed.address],prior,168);
  const [a,b]=sameConfiguration(prior,next,168);if(b.length<266)fail();
  const old=price(a,168),current=price(b,168);
  if(old.timestamp<price(bytes(context.agSnapshot[feed.address]),168).timestamp||current.timestamp<old.timestamp)fail('TIMESTAMP_REGRESSION');fresh(current,Math.min(30,b.readUInt32LE(185)),nowSeconds);
  const lazerBefore=before[feed.lazerFeed],lazerAfter=after[feed.lazerFeed];
  const contextBytes=bytes(context.extra[feed.lazerFeed]),l0=bytes(lazerBefore),l1=bytes(lazerAfter);
  if(context.extra[feed.lazerFeed].lamports!==lazerBefore.lamports||lazerBefore.lamports!==lazerAfter.lamports)fail('CONFIGURATION');
  const contextComparison=comparePerpsDovesLazerConfiguration(contextBytes,l0);
  if(contextComparison.after.timestamp<contextComparison.before.timestamp||contextComparison.before.micros!==null&&(contextComparison.after.micros===null||contextComparison.after.micros<contextComparison.before.micros))fail('TIMESTAMP_REGRESSION');
  const oldFeed=price(l0,73),currentFeed=price(l1,73);
  const signed=signedFeeds.get(feed.lazerFeed);
  checkPerpsDovesLazerEffects(l0,l1,signed);
  if(oldFeed.timestamp<price(bytes(context.extra[feed.lazerFeed]),73).timestamp||currentFeed.timestamp<oldFeed.timestamp)fail('TIMESTAMP_REGRESSION');fresh(currentFeed,Math.min(60,b.readUInt32LE(189)),nowSeconds);
  prices.push(Object.freeze({address:feed.address,priceLowerUsdUnits:current.lower.toString(),priceUpperUsdUnits:current.upper.toString(),timestampSeconds:current.timestamp.toString()}));
 }
 const current=prices.find(p=>p.address===market.dovesAgOracle);if(!current)fail();
 const limit=BigInt(inspection.bindings.core.priceSlippageUsdUnits);
 if(plan.side==='LONG'?BigInt(current.priceLowerUsdUnits)<limit:BigInt(current.priceUpperUsdUnits)>limit)fail('PRICE_LIMIT');
 const result=Object.freeze({stage:'FULL_CLOSE_ORACLE_PRICE_EFFECTS_ONLY',readyForSigning:false,tradingEnabled:false,
  observedSlot:simulation.observedSlot,positionAddress:plan.positionAddress,prices:Object.freeze(prices),
  requiresOraclePayloadProvenance:true,requiresRemainingPoolEconomics:true,requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({reserves}));return result;
}
