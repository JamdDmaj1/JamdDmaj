// Read-only simulation of the exact owner/keeper-unsigned envelope.
// Position effects alone do not approve token movements, rent, exits or signing.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
import {decodeServerPerpsPosition,checkServerPerpsPositionIncrease} from './perps-server-position.js';
import {PERPS_CUSTODIES} from './perps-server-custody.js';
import {checkServerPerpsSimulatedExits} from './perps-server-exits.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_SIMULATION');}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function account(value){
 if(value===null)return null;
 if(!value||typeof value.owner!=='string'||typeof value.executable!=='boolean')fail();
 try{if(bs58.decode(value.owner).length!==32)fail();}catch{fail();}
 const lamports=typeof value.lamports==='number'?String(integer(value.lamports)):value.lamports;
 if(typeof lamports!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(lamports)||BigInt(lamports)>18446744073709551615n
   ||!Array.isArray(value.data)||value.data.length!==2||value.data[1]!=='base64'||typeof value.data[0]!=='string'||value.data[0].length>21848)fail();
 const bytes=Buffer.from(value.data[0],'base64');if(bytes.length>16384||bytes.toString('base64')!==value.data[0])fail();
 return Object.freeze({owner:value.owner,executable:value.executable,lamports,data:Object.freeze([...value.data])});
}
function snapshot(addresses,values){
 if(!Array.isArray(values)||values.length!==addresses.length)fail();
 return Object.freeze(Object.fromEntries(addresses.map((address,i)=>[address,account(values[i])])));
}
export function getServerPerpsSimulationSnapshots(result,expectedWire){
 const proof=proofs.get(result);if(!proof||proof.wire!==expectedWire)fail();return proof;
}
export async function simulateServerPerpsPositionEffects(prepared,{request,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow(),intent=structuredClone(prepared?.intent);
 if(!Number.isFinite(started)||prepared?.stage!=='INSPECTED_NOT_AUTHORIZED'||!intent)fail();
 const wire=prepared.preparation?.serializedTxBase64,envelope=decodeServerPerpsEnvelope(wire,intent.walletAddress),capabilities=checkServerPerpsCapabilities(envelope);
 const inspection=prepared.inspection,custody=prepared.custody,keys=inspection?.resolvedKeys;
 if(inspection?.envelope?.serializedTxBase64!==wire||!Array.isArray(keys)||keys.length!==envelope.accountCount||custody?.position!==prepared.preparation.positionPubkey)fail();
 for(let i=0;i<envelope.staticKeys.length;i++)if(keys[i]!==envelope.staticKeys[i])fail();
 const minimum=integer(custody.observedSlot),heightText=String(prepared.preparation.txMetadata?.lastValidBlockHeight);
 if(!/^[1-9][0-9]{0,19}$/.test(heightText)||BigInt(heightText)>18446744073709551615n)fail();
 const lastHeight=BigInt(heightText),addresses=[];
 const loadedWritable=envelope.lookups.reduce((n,l)=>n+l.writable.length,0);
 for(let i=0;i<keys.length;i++){
  const writable=i<3?i<3-envelope.readonlySigned:i<envelope.staticKeys.length?i<envelope.staticKeys.length-envelope.readonlyUnsigned:i<envelope.staticKeys.length+loadedWritable;
  if(writable)addresses.push(keys[i]);
 }
 const [source]=await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(intent.walletAddress),bs58.decode(TOKEN),bs58.decode(PERPS_CUSTODIES.USDC.mint)]});
 if(!addresses.includes(source))addresses.push(source);
 if(addresses.length>100||new Set(addresses).size!==addresses.length||!addresses.includes(intent.walletAddress)||!addresses.includes(custody.position))fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 let slot=integer(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimum}]));if(slot<minimum)fail();
 const height=async()=>{const value=integer(await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:slot}]));if(BigInt(value)>lastHeight)fail();};
 await height();
 const beforeReply=await request('getMultipleAccounts',[addresses,{commitment:'confirmed',encoding:'base64',minContextSlot:slot}]);
 const beforeSlot=integer(beforeReply?.context?.slot);if(beforeSlot<slot)fail();slot=beforeSlot;
 const before=snapshot(addresses,beforeReply.value);
 const feeReply=await request('getFeeForMessage',[Buffer.from(wire,'base64').subarray(193).toString('base64'),{commitment:'confirmed',minContextSlot:slot}]);
 const feeSlot=integer(feeReply?.context?.slot);if(feeSlot<slot)fail();slot=feeSlot;
 const fee=integer(feeReply.value);if(fee<1||fee>1000000)fail();
 const response=await request('simulateTransaction',[wire,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:slot,accounts:{encoding:'base64',addresses}}]);
 const simulationSlot=integer(response?.context?.slot);if(simulationSlot<slot)fail();slot=simulationSlot;
 const value=response?.value;
 if(!value||!Object.hasOwn(value,'err')||value.err!==null||value.replacementBlockhash!=null)fail();
 const consumed=integer(value.unitsConsumed);if(consumed<1||BigInt(consumed)>BigInt(capabilities.computeUnitLimit))fail();
 const after=snapshot(addresses,value.accounts);
 const previous=before[custody.position]===null?null:await decodeServerPerpsPosition(custody.position,before[custody.position],intent);
 const next=await decodeServerPerpsPosition(custody.position,after[custody.position],intent);
 const positionEffects=checkServerPerpsPositionIncrease(previous,next,intent,inspection.core.sizeUsdUnits);
 const exits=await checkServerPerpsSimulatedExits(prepared,before,after);
 await height();if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>30000)fail();
 const result=Object.freeze({stage:'SIMULATED_POSITION_AND_EXITS',readyForSigning:false,tradingEnabled:false,observedSlot:slot,feeLamports:String(fee),unitsConsumed:String(consumed),positionEffects,exits,
  requiresFullTokenPolicy:true,requiresFundingAndRentChecks:true,requiresFreshRiskReservation:true});
 proofs.set(result,Object.freeze({wire,source,before,after,intent:Object.freeze(intent),envelope,keys:Object.freeze([...keys])}));return result;
}
