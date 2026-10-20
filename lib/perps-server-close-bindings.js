// Closing-position account identities only. These checks are NOT an oracle or
// token policy, same-wire simulation, durable reservation, or signing authority.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities,requireDecodedServerPerpsCustody,decodeServerPerpsCustody} from './perps-server-custody.js';
import {checkServerPerpsFullCloseCore,requireFreshServerPerpsFullClosePlan} from './perps-server-close-intent.js';
import {resolveServerPerpsPreparationEnvelope} from './perps-server-preparation.js';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const inspections=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_ACCOUNT_BINDINGS_MISMATCH');}
export function readInspectedServerPerpsFullClose(value){
 const proof=inspections.get(value);if(!proof)fail();requireFreshServerPerpsFullClosePlan(proof.plan);return proof;
}
const associated=async owner=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(PERPS_CUSTODIES.USDC.mint)]}))[0];
function writable(envelope,index){
 if(index<3)return index<3-envelope.readonlySigned;
 if(index<envelope.staticKeys.length)return index<envelope.staticKeys.length-envelope.readonlyUnsigned;
 return index<envelope.staticKeys.length+envelope.lookups.reduce((sum,table)=>sum+table.writable.length,0);
}
export async function checkServerPerpsFullCloseBindings(inspection,plan,market,collateral,nowSeconds){
 requireFreshServerPerpsFullClosePlan(plan);
 // Freeze caller-controlled structure before asynchronous PDA derivations.
 inspection=structuredClone(inspection);
 requireDecodedServerPerpsCustody(market);requireDecodedServerPerpsCustody(collateral);
 if(market.asset!==plan.asset||collateral.asset!==(plan.side==='LONG'?plan.asset:'USDC')||!market.allowDecrease||!collateral.allowDecrease)fail();
 const envelope=inspection?.envelope,keys=inspection?.resolvedKeys;
 const capabilities=checkServerPerpsCapabilities(envelope);
 if(!Array.isArray(keys)||keys.length!==envelope.accountCount||new Set(keys).size!==keys.length||keys[0]!==plan.walletAddress
  ||envelope.staticKeys.some((key,i)=>key!==keys[i]))fail();
 const ids=await deriveServerPerpsIdentities(plan),recipient=await associated(plan.walletAddress);
 if(ids.position!==plan.positionAddress)fail();
 let core=null,requestAddress=null,requestAta=null;
 for(const ix of envelope.instructions){
  if(!Number.isInteger(ix.program)||ix.program<0||ix.program>=keys.length||!Array.isArray(ix.accounts)
   ||ix.accounts.some(index=>!Number.isInteger(index)||index<0||index>=keys.length))fail();
  if(keys[ix.program]!==PERPS_PROGRAM)continue;
  if(core!==null||ix.accounts.length!==22||ix.accounts[0]!==1||ix.accounts[1]!==2||ix.accounts[2]!==0)fail();
  core=checkServerPerpsFullCloseCore(ix.dataBase64,plan,nowSeconds);
  const roles=ix.accounts.map(index=>keys[index]);
  let expected;
  if(core.variant==='instantDecreasePosition'){
   if(![market.oracle,market.dovesAgOracle].includes(roles[10])||![collateral.oracle,collateral.dovesAgOracle].includes(roles[13]))fail();
   expected=[keys[1],keys[2],plan.walletAddress,recipient,ids.transferAuthority,ids.perpetuals,PERPS_POOL,ids.position,
    market.address,market.dovesAgOracle,roles[10],collateral.address,collateral.dovesAgOracle,roles[13],collateral.tokenAccount,
    PERPS_CUSTODIES.USDC.mint,PERPS_PROGRAM,TOKEN,ATA,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
  }else{
   const counter=Buffer.alloc(8);counter.writeBigUInt64LE(BigInt(core.counter));
   [requestAddress]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),counter,new Uint8Array([2])]});
   requestAta=await associated(requestAddress);
   expected=[keys[1],keys[2],plan.walletAddress,recipient,ids.transferAuthority,ids.perpetuals,PERPS_POOL,ids.position,
    market.address,market.dovesAgOracle,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,
    PERPS_CUSTODIES.USDC.mint,PERPS_PROGRAM,requestAddress,requestAta,TOKEN,ATA,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
  }
  if(roles.some((key,i)=>key!==expected[i]))fail();
  const variant1=core.variant==='instantDecreasePosition',mut=new Set(variant1?[2,3,6,7,8,11,14]:[2,3,6,7,8,10,12,15,16]);
  // Oracle accounts may have a globally upgraded write capability from an
  // earlier DOVES update. That update still needs its own full oracle policy.
  const oracleRoles=new Set(variant1?[9,10,12,13]:[9,11]);
  for(let role=0;role<22;role++){
   const index=ix.accounts[role];
   if((index<3)!==(role<3))fail();
   if(role===0||oracleRoles.has(role))continue;
   if(writable(envelope,index)!==mut.has(role))fail();
  }
 }
 if(core===null)fail();
 requireFreshServerPerpsFullClosePlan(plan);
 return Object.freeze({stage:'FULL_CLOSE_BINDINGS_ONLY',readyForSigning:false,positionAddress:ids.position,
  recipient,requestAddress,requestAta,capabilities,core,
  requiresFullInstructionPolicy:true,requiresSameWireSimulation:true,requiresFreshRiskAndJournal:true});
}
// Independently fetch program-owned custody data, in a bank no older than the
// resolved transaction/position proof. No builder-supplied vault/oracle data.
export async function inspectServerPerpsFullClosePreparation(preparation,plan,{request,nowSeconds}={}){
 requireFreshServerPerpsFullClosePlan(plan);if(typeof request!=='function')fail();
 preparation=structuredClone(preparation);
 if(preparation.positionPubkey!==plan.positionAddress)fail();
 const resolved=await resolveServerPerpsPreparationEnvelope(preparation,plan.walletAddress,{request,minimumSlot:plan.observedSlot});
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const assets=[plan.asset,...(plan.side==='SHORT'?['USDC']:[])],addresses=assets.map(asset=>PERPS_CUSTODIES[asset].address);
 const reply=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:resolved.observedSlot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<resolved.observedSlot||!Array.isArray(reply.value)||reply.value.length!==assets.length)fail();
 const custodies=assets.map((asset,i)=>decodeServerPerpsCustody(asset,addresses[i],reply.value[i]));
 const bindings=await checkServerPerpsFullCloseBindings(resolved,plan,custodies[0],custodies.at(-1),nowSeconds);
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 requireFreshServerPerpsFullClosePlan(plan);
 const result=Object.freeze({...resolved,stage:'FULL_CLOSE_INSPECTED_NOT_AUTHORIZED',readyForSigning:false,
  tradingEnabled:false,observedSlot:reply.context.slot,bindings,
  requiresFullInstructionPolicy:true,requiresSameWireSimulation:true,requiresFreshRiskAndJournal:true});
 inspections.set(result,Object.freeze({plan,lastValidBlockHeight:String(preparation.txMetadata.lastValidBlockHeight)}));return result;
}
