// Same-wire custody/vault identity and mint-conservation checks. These are not
// complete pool accounting, oracle prices, minimum-return risk or signing authority.
import {createHash} from 'node:crypto';
import {readServerPerpsFullCloseFunding,readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readServerPerpsFullClosePolicy} from './perps-server-close-policy.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH');}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
function stableTokenMetadata(a,b){
 const x=bytes(a),y=bytes(b);x.fill(0,64,72);y.fill(0,64,72);
 if(a.owner!==b.owner||a.lamports!==b.lamports||!x.equals(y))fail();
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
 for(const c of new Map([market,collateral,usdc].map(c=>[c.address,c])).values()){
  const a=before[c.address],b=after[c.address];
  const old=decodeServerPerpsCustody(c.asset,c.address,a),next=decodeServerPerpsCustody(c.asset,c.address,b);
  // Decode exposes custody configuration/identities, not mutable economic totals.
  if(JSON.stringify(old)!==JSON.stringify(c)||JSON.stringify(next)!==JSON.stringify(old)||a.lamports!==b.lamports||bytes(a).length!==bytes(b).length)fail();
 }
 function vault(c){
  const a=before[c.tokenAccount],b=after[c.tokenAccount];
  const old=readPerpsCloseLegacyToken(a,ids.transferAuthority,c.mint),next=readPerpsCloseLegacyToken(b,ids.transferAuthority,c.mint);
  stableTokenMetadata(a,b);return old-next;
 }
 const usdcDebit=vault(usdc);
 if(usdcDebit!==BigInt(simulation.receivedUsdcUnits)||usdcDebit<0n)fail();
 // LONG closes withdraw collateral then return exactly that incremental amount
 // through the bound internal swap. Existing wallet collateral is preserved by
 // the funding gate; the collateral vault's final token/lamport amount is intact.
 if(plan.side==='LONG'&&vault(collateral)!==0n)fail();
 readServerPerpsFullCloseFunding(funding);readServerPerpsFullClosePolicy(policy);
 const result=Object.freeze({stage:'FULL_CLOSE_VAULT_CONSERVATION_ONLY',readyForSigning:false,tradingEnabled:false,
  positionAddress:plan.positionAddress,usdcVaultDebitUnits:usdcDebit.toString(),collateralVaultNetDebitUnits:plan.side==='LONG'?'0':usdcDebit.toString(),
  requiresPoolAccountingAndOracleEffects:true,requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({funding,policy}));return result;
}
