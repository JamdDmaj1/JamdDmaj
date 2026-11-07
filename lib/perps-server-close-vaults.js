// Same-wire custody/vault identity and mint-conservation checks. These are not
// complete pool accounting, oracle prices, minimum-return risk or signing authority.
import {createHash} from 'node:crypto';
import {readServerPerpsFullCloseFunding,readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readServerPerpsFullClosePolicy} from './perps-server-close-policy.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {checkPerpsClosePoolConfiguration} from './perps-server-close-pool.js';
import {checkPerpsCloseCustodyTail} from './perps-close-impact-history.js';
const proofs=new WeakMap();
function fail(stage='unknown'){throw Object.assign(Error('PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH'),{diagnosticStage:stage});}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
function stableTokenMetadata(a,b,nativeDebit=0n){
 const x=bytes(a),y=bytes(b);x.fill(0,64,72);y.fill(0,64,72);
 if(a.owner!==b.owner||BigInt(a.lamports)-BigInt(b.lamports)!==nativeDebit||!x.equals(y))fail('vault-token-metadata');
}
export function readServerPerpsFullCloseVaults(value){
 const proof=proofs.get(value);if(!proof)fail();readServerPerpsFullCloseFunding(proof.funding);readServerPerpsFullClosePolicy(proof.policy);return proof;
}
export async function checkServerPerpsFullCloseVaults(funding,policy,{nowSeconds=Math.floor(Date.now()/1000)}={}){
 const {simulation}=readServerPerpsFullCloseFunding(funding),snapshot=readServerPerpsFullCloseSimulation(simulation);
 const {inspection,before,after}=snapshot;
 if(snapshot.beforeSlot!==snapshot.simulationSlot||snapshot.simulationSlot!==simulation.observedSlot)fail('snapshot-bank');
 if(readServerPerpsFullClosePolicy(policy).inspection!==inspection)fail();
 const {plan,market,collateral,usdc}=readInspectedServerPerpsFullClose(inspection),ids=await deriveServerPerpsIdentities(plan);
 if(ids.position!==plan.positionAddress)fail();
 const poolTag=createHash('sha256').update('account:Pool').digest().subarray(0,8);
 for(const pool of [before[PERPS_POOL],after[PERPS_POOL]])if(pool?.owner!==PERPS_PROGRAM||!bytes(pool).subarray(0,8).equals(poolTag))fail();
 if(before[PERPS_POOL].lamports!==after[PERPS_POOL].lamports||bytes(before[PERPS_POOL]).length!==bytes(after[PERPS_POOL]).length)fail();
 checkPerpsClosePoolConfiguration(before[PERPS_POOL],after[PERPS_POOL],[market.address,collateral.address,usdc.address]);
 for(const c of new Map([market,collateral,usdc].map(c=>[c.address,c])).values()){
  const a=before[c.address],b=after[c.address];
  const old=decodeServerPerpsCustody(c.asset,c.address,a),next=decodeServerPerpsCustody(c.asset,c.address,b);
  // Decode exposes custody configuration/identities, not mutable economic totals.
  if(JSON.stringify(old)!==JSON.stringify(c)||JSON.stringify(next)!==JSON.stringify(old)||a.lamports!==b.lamports||bytes(a).length!==bytes(b).length)fail('custody-identity');
  // The public decoder exposes only selected configuration fields. Comparing
  // that projection alone would miss a changed pricing/fee parameter. Only
  // the pinned Assets/FundingRateState counters and independently checked
  // market impact-history transition may change. Configuration stays exact.
  const prior=bytes(a),following=bytes(b);
  if(!prior.subarray(0,214).equals(following.subarray(0,214))){
   const diagnosticOffsets=[];for(let i=0;i<prior.length&&diagnosticOffsets.length<32;i++)if((i<214||i>=286)&&prior[i]!==following[i])diagnosticOffsets.push(i);
   throw Object.assign(Error('PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH'),{diagnosticStage:'custody-immutable-bytes',diagnosticOffsets});
  }
  checkPerpsCloseCustodyTail(prior,following,{sizeUsdUnits:plan.sizeUsdUnits,requestTimeSeconds:inspection.bindings.core.requestTimeSeconds,isMarket:c.address===market.address,side:plan.side,nowSeconds});
 }
 function vault(c){
  const a=before[c.tokenAccount],b=after[c.tokenAccount];
  const old=readPerpsCloseLegacyToken(a,ids.transferAuthority,c.mint),next=readPerpsCloseLegacyToken(b,ids.transferAuthority,c.mint);
  stableTokenMetadata(a,b,c.asset==='SOL'?old-next:0n);
  const prior=bytes(before[c.address]),following=bytes(after[c.address]);
  // SHORT USDC collateral is segregated from JLP owned assets: a full close
  // releases the exact native position collateral as well as pool PnL/fees.
  // LONG collateral is already in owned; never apply this credit to that path
  // or to a swap vault. Both USDC token and USD accounting use six decimals.
  // The margin comes from the privately bound same-wire position, not a quote.
  const total=data=>data.readBigUInt64LE(214)+data.readBigUInt64LE(222);
  const segregated=plan.side==='SHORT'&&c.address===collateral.address;
  if(segregated&&(c.asset!=='USDC'||c.decimals!==6||!c.stable||c.address!==usdc.address))fail('short-collateral-identity');
  const principal=segregated?BigInt(plan.collateralUsdUnits):0n;
  if(total(prior)-total(following)+principal!==old-next)fail('vault-book-conservation');
  return old-next;
 }
 const usdcDebit=vault(usdc);
 if(usdcDebit!==BigInt(simulation.receivedUsdcUnits)||usdcDebit<0n)fail('usdc-owner-payout');
 // A direct-USDC LONG returns its withdrawal through the bound internal swap
 // (zero net collateral debit). A two-step LONG leaves exactly the incremental
 // collateral withdrawal with the owner; it has not yet produced USDC.
 const collateralDebit=plan.side==='LONG'?vault(collateral):usdcDebit;
 if(plan.side==='LONG'&&collateralDebit!==(plan.requiresSeparateUsdcConversion?BigInt(simulation.receivedCollateralUnits):0n))fail('collateral-owner-payout');
 readServerPerpsFullCloseFunding(funding);readServerPerpsFullClosePolicy(policy);
 const result=Object.freeze({stage:'FULL_CLOSE_VAULT_CONSERVATION_ONLY',readyForSigning:false,tradingEnabled:false,
  positionAddress:plan.positionAddress,usdcVaultDebitUnits:usdcDebit.toString(),collateralVaultNetDebitUnits:collateralDebit.toString(),
  requiresPoolAccountingAndOracleEffects:true,requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({funding,policy}));return result;
}
