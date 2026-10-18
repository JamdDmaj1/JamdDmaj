// Server preparation inspection. No signing or broadcast capability.
import bs58 from 'bs58';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
import {inspectServerPerpsBoundCore} from './perps-server-intent.js';
import {prepareConfiguredAutomation} from './automation-preparation.js';
import {readAndCheckServerPerpsCustodies} from './perps-server-custody.js';
import {simulateServerPerpsPositionEffects} from './perps-server-simulation.js';
import {checkServerPerpsFundingSimulation} from './perps-server-funding-simulation.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TABLE_PROGRAM='AddressLookupTab1e1111111111111111111111111';
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_PREPARATION');}
function slot(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function tableEntries(account,bankSlot){
 if(account?.owner!==TABLE_PROGRAM||account.executable!==false||!Array.isArray(account.data)
   ||account.data.length!==2||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>11000)fail();
 const data=Buffer.from(account.data[0],'base64');
 if(data.toString('base64')!==account.data[0]||data.length<56||data.length>8248||(data.length-56)%32!==0
   ||data.readUInt32LE(0)!==1||data.readBigUInt64LE(4)!==18446744073709551615n||![0,1].includes(data[21]))fail();
 const count=(data.length-56)/32,start=data[20],extended=data.readBigUInt64LE(12);
 if(start>count||extended>BigInt(bankSlot))fail();
 const usable=extended===BigInt(bankSlot)?start:count;
 return index=>{if(!Number.isInteger(index)||index<0||index>=usable)fail();return bs58.encode(data.subarray(56+index*32,88+index*32));};
}
export async function inspectServerPerpsPreparation(preparation,intent,{request,nowSeconds,minimumSlot=0}={}){
 if(typeof request!=='function'||!Number.isSafeInteger(nowSeconds)||nowSeconds<30)fail();
 minimumSlot=slot(minimumSlot);
 const envelope=decodeServerPerpsEnvelope(preparation?.serializedTxBase64,intent?.walletAddress);
 const capabilities=checkServerPerpsCapabilities(envelope);
 if(envelope.blockhash!==preparation?.txMetadata?.blockhash)fail();
 const height=String(preparation?.txMetadata?.lastValidBlockHeight);
 if(!/^(0|[1-9][0-9]{0,19})$/.test(height)||BigInt(height)===0n||BigInt(height)>18446744073709551615n)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const observed=slot(await request('getSlot',[{commitment:'confirmed',minContextSlot:minimumSlot}]));
 if(observed<minimumSlot)fail();
 const writable=[],readonly=[];let resolvedSlot=observed;
 if(envelope.lookups.length){
  // Fetch all tables in one bank snapshot; never trust builder-supplied keys.
  const response=await request('getMultipleAccounts',[envelope.lookups.map(l=>l.address),{encoding:'base64',commitment:'confirmed',minContextSlot:observed}]);
  resolvedSlot=slot(response?.context?.slot);
  if(resolvedSlot<observed||!Array.isArray(response.value)||response.value.length!==envelope.lookups.length)fail();
  for(let i=0;i<envelope.lookups.length;i++){
   const at=tableEntries(response.value[i],resolvedSlot),lookup=envelope.lookups[i];
   for(const index of lookup.writable)writable.push(at(index));
   for(const index of lookup.readonly)readonly.push(at(index));
  }
 }
 const resolvedKeys=Object.freeze([...envelope.staticKeys,...writable,...readonly]);
 if(resolvedKeys.length!==envelope.accountCount||new Set(resolvedKeys).size!==resolvedKeys.length)fail();
 const core=inspectServerPerpsBoundCore(envelope,resolvedKeys,intent,nowSeconds);
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 return Object.freeze({stage:'INSPECTED_NOT_AUTHORIZED',readyForSigning:false,tradingEnabled:false,
  envelope,capabilities,core,resolvedKeys,observedSlot:resolvedSlot,
  requiresVerifiedCustodiesAndPdas:true,requiresFullTokenPolicy:true,requiresSameWireSimulation:true,requiresFreshFundingAndRisk:true});
}
// Actual server entry connects existing Telegram settings/preparation to the
// combined structural gates. It still cannot return a signing-ready operation.
export async function prepareInspectedServerAutomation(input,{builderRequest,rpcRequest,nowSeconds,minimumSlot=0}={}){
 // Bind the intent before asynchronous preparation; caller mutations must not
 // change the wallet, limits or signal while a provider response is in flight.
 input=structuredClone(input);
 const prepared=await prepareConfiguredAutomation(input,builderRequest);
 const intent={asset:prepared.plan.body.asset,side:prepared.plan.body.side.toUpperCase(),walletAddress:input.walletAddress,
  marginUsd:String(prepared.review.marginUsd),leverage:String(prepared.review.leverage),maxSlippageBps:input.maxSlippageBps,
  referencePrice:String(input.signal.entry),stopLoss:String(prepared.review.sl),takeProfit:String(prepared.review.tp)};
 const inspection=await inspectServerPerpsPreparation(prepared.preparation,intent,{request:rpcRequest,nowSeconds,minimumSlot});
 const custody=await readAndCheckServerPerpsCustodies(inspection,intent,{request:rpcRequest});
 if(custody.position!==prepared.preparation.positionPubkey)fail();
 const inspected=Object.freeze({...prepared,intent:Object.freeze(intent),inspection,custody,stage:inspection.stage,readyForSigning:false,tradingEnabled:false});
 const simulation=await simulateServerPerpsPositionEffects(inspected,{request:rpcRequest});
 const funding=await checkServerPerpsFundingSimulation(inspected,simulation,{request:rpcRequest});
 return Object.freeze({...inspected,simulation,funding,stage:'SIMULATED_FUNDING_AND_EXITS',readyForSigning:false,tradingEnabled:false,
  requiresFullTokenPolicy:true,requiresFreshRiskReservation:true});
}
