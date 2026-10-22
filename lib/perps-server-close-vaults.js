// Same-wire custody/vault identity and mint-conservation checks. These are not
// complete pool accounting, oracle prices, minimum-return risk or signing authority.
import {createHash} from 'node:crypto';
import {readServerPerpsFullCloseFunding,readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readServerPerpsFullClosePolicy} from './perps-server-close-policy.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {checkPerpsClosePoolConfiguration} from './perps-server-close-pool.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH');}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
function stableTokenMetadata(a,b,nativeDebit=0n){
 const x=bytes(a),y=bytes(b);x.fill(0,64,72);y.fill(0,64,72);
 if(a.owner!==b.owner||BigInt(a.lamports)-BigInt(b.lamports)!==nativeDebit||!x.equals(y))fail();
}
export function readServerPerpsFullCloseVaults(value){
 const proof=proofs.get(value);if(!proof)fail();readServerPerpsFullCloseFunding(proof.funding);readServerPerpsFullClosePolicy(proof.policy);return proof;
}
export async function checkServerPerpsFullCloseVaults(funding,policy){
 const {simulation}=readServerPerpsFullCloseFunding(funding),snapshot=readServerPerpsFullCloseSimulation(simulation);
 const {inspection,before,after}=snapshot;
 if(snapshot.beforeSlot!==snapshot.simulationSlot||snapshot.simulationSlot!==simulation.observedSlot)fail();
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
  if(JSON.stringify(old)!==JSON.stringify(c)||JSON.stringify(next)!==JSON.stringify(old)||a.lamports!==b.lamports||bytes(a).length!==bytes(b).length)fail();
  // The public decoder exposes only selected configuration fields. Comparing
  // that projection alone would miss a changed pricing/fee parameter. Only
  // the pinned Assets and FundingRateState counters may change during a close;
  // any other account mutation requires a separately reviewed policy.
  const prior=bytes(a),following=bytes(b);
  if(!prior.subarray(0,214).equals(following.subarray(0,214))||!prior.subarray(286).equals(following.subarray(286)))fail();
 }
 function vault(c){
  const a=before[c.tokenAccount],b=after[c.tokenAccount];
  const old=readPerpsCloseLegacyToken(a,ids.transferAuthority,c.mint),next=readPerpsCloseLegacyToken(b,ids.transferAuthority,c.mint);
  stableTokenMetadata(a,b,c.asset==='SOL'?old-next:0n);
  const prior=bytes(before[c.address]),following=bytes(after[c.address]);
  // Assets.owned excludes separately reserved protocol fees. Moving earned
  // fees from owned to feesReserves conserves their sum; withdrawing collateral
  // reduces it by exactly the token-vault debit. Never accept an unexplained
  // book-value change even when the wallet happens to receive the right amount.
  const total=data=>data.readBigUInt64LE(214)+data.readBigUInt64LE(222);
  if(total(prior)-total(following)!==old-next)fail();
  return old-next;
 }
 const usdcDebit=vault(usdc);
 if(usdcDebit!==BigInt(simulation.receivedUsdcUnits)||usdcDebit<0n)fail();
 // A direct-USDC LONG returns its withdrawal through the bound internal swap
 // (zero net collateral debit). A two-step LONG leaves exactly the incremental
 // collateral withdrawal with the owner; it has not yet produced USDC.
 const collateralDebit=plan.side==='LONG'?vault(collateral):usdcDebit;
 if(plan.side==='LONG'&&collateralDebit!==(plan.requiresSeparateUsdcConversion?BigInt(simulation.receivedCollateralUnits):0n))fail();
 readServerPerpsFullCloseFunding(funding);readServerPerpsFullClosePolicy(policy);
 const result=Object.freeze({stage:'FULL_CLOSE_VAULT_CONSERVATION_ONLY',readyForSigning:false,tradingEnabled:false,
  positionAddress:plan.positionAddress,usdcVaultDebitUnits:usdcDebit.toString(),collateralVaultNetDebitUnits:collateralDebit.toString(),
  requiresPoolAccountingAndOracleEffects:true,requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({funding,policy}));return result;
}
