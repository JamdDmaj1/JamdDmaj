// Independently bound DOVES oracle configuration, not price/payload or signing
// approval. Layout: program-owned Anchor IDL hash 1ae8e5e335beec1646d5484671d8f07902fb5ac55581c3028701893b998025f5.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {PERPS_PYTH_LAZER,decodePerpsPythStorage} from './perps-pyth-storage.js';
export const CLOSE_DOVES_PROGRAM='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
export const CLOSE_PYTH_LAZER=PERPS_PYTH_LAZER;
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111',contexts=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_ORACLE_CONTEXT');}
function bytes(a,owner,min){
 if(!a||a.owner!==owner||a.executable)fail();const b=Buffer.from(a.data[0],'base64');if(b.length<min||b.length>4096)fail();return b;
}
export function readServerPerpsCloseOracleContext(value,inspection){
 const proof=contexts.get(value);if(!proof||proof.inspection!==inspection)fail();readInspectedServerPerpsFullClose(inspection);return proof;
}
export async function readServerPerpsCloseOracles(inspection,{request}={}){
 const {plan,market,usdc}=readInspectedServerPerpsFullClose(inspection);if(typeof request!=='function')fail();
 // Collateral settlement of a LONG uses only its market/collateral oracle.
 // There is no USDC swap in that wire; do not invent a USDC price dependency.
 // SHORT and direct-USDC LONG paths still require both native oracle feeds.
 const custodies=plan.requiresSeparateUsdcConversion?[market]:[market,usdc],keys=custodies.map(c=>c.dovesAgOracle);
 if(new Set(keys).size!==keys.length)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const first=await request('getMultipleAccounts',[keys,{encoding:'base64',commitment:'confirmed',minContextSlot:inspection.observedSlot}]);
 if(!Number.isSafeInteger(first?.context?.slot)||first.context.slot<inspection.observedSlot)fail();
 const agSnapshot=canonicalServerPerpsSimulationSnapshot(keys,first.value),feeds=[];
 for(let i=0;i<keys.length;i++){
  const c=custodies[i],b=bytes(agSnapshot[keys[i]],CLOSE_DOVES_PROGRAM,266);
  const [address,bump]=await getProgramDerivedAddress({programAddress:CLOSE_DOVES_PROGRAM,seeds:['ag_feed',bs58.decode(c.mint)]});
  if(address!==keys[i]||b[201]!==bump||b.subarray(0,8).toString('hex')!=='70f98bd9d7d0f936'||bs58.encode(b.subarray(8,40))!==c.mint)fail();
  const lazerFeed=bs58.encode(b.subarray(202,234));if(lazerFeed===SYSTEM)fail();
  feeds.push(Object.freeze({address,mint:c.mint,lazerFeed,clFeed:bs58.encode(b.subarray(72,104)),redstoneFeed:bs58.encode(b.subarray(234,266))}));
 }
 const feedKeys=[...new Set(feeds.map(f=>f.lazerFeed))],extraKeys=[...feedKeys,CLOSE_PYTH_LAZER.storage,CLOSE_PYTH_LAZER.treasury];
 if(new Set(extraKeys).size!==extraKeys.length)fail();
 const next=await request('getMultipleAccounts',[extraKeys,{encoding:'base64',commitment:'confirmed',minContextSlot:first.context.slot}]);
 if(!Number.isSafeInteger(next?.context?.slot)||next.context.slot<first.context.slot)fail();
 const extra=canonicalServerPerpsSimulationSnapshot(extraKeys,next.value);
 for(const key of feedKeys)if(bytes(extra[key],CLOSE_DOVES_PROGRAM,96).subarray(0,8).toString('hex')!=='bd67fc179823f39c')fail();
 const pythStorage=decodePerpsPythStorage(CLOSE_PYTH_LAZER.storage,extra[CLOSE_PYTH_LAZER.storage]);
 const treasury=extra[CLOSE_PYTH_LAZER.treasury];if(!treasury||treasury.owner!==SYSTEM||treasury.executable||treasury.data[0]!=='')fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 readInspectedServerPerpsFullClose(inspection);
 const result=Object.freeze({stage:'CLOSE_ORACLE_ACCOUNT_CONTEXT_ONLY',readyForSigning:false,observedSlot:next.context.slot,feeds:Object.freeze(feeds),
  lazerFeeds:Object.freeze(feedKeys),treasury:CLOSE_PYTH_LAZER.treasury,requiresOraclePayloadAndEffects:true});
 contexts.set(result,Object.freeze({inspection,agSnapshot,extra,pythStorage}));return result;
}
