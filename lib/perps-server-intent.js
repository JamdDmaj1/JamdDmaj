// Server-side integer instruction/intent checks ported from native policy.
// Caller must select core instructions using verified program/account bindings.
// This is NOT a complete transaction policy, simulation or signing capability.
import {exactUsdUnits} from './jupiter-perps-order.js';
const INCREASE='a47e44b6dfa640b7',TPSL='7562427f1e3249b9';
const PROGRAM='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
function fail(){throw Error('PERPS_INSTRUCTION_INTENT_MISMATCH');}
function decode(encoded){
 if(typeof encoded!=='string'||encoded.length>88)fail();
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.toString('base64')!==encoded||bytes.length<8||bytes.length>64)fail();
 let cursor=8;
 const u8=()=>{if(cursor>=bytes.length)fail();return bytes[cursor++];};
 const bool=()=>{const value=u8();if(value>1)fail();return value===1;};
 const u64=()=>{if(cursor+8>bytes.length)fail();const value=bytes.readBigUInt64LE(cursor);cursor+=8;return value;};
 const tag=bytes.subarray(0,8).toString('hex');let result;
 if(tag===INCREASE){
  const size=u64(),collateral=bool()?u64():null,side=u8(),price=u64(),requestTime=u64();
  if(size===0n||![1,2].includes(side))fail();
  result={kind:'INCREASE',size,collateral,side,price,requestTime};
 }else if(tag===TPSL){
  result={kind:'TPSL',collateral:u64(),size:u64(),price:u64(),triggerAbove:bool(),entirePosition:bool(),counter:u64(),requestTime:u64()};
 }else fail();
 if(cursor!==bytes.length||result.price===0n||result.requestTime===0n||result.requestTime>9223372036854775807n)fail();
 return Object.freeze(result);
}
export function checkServerPerpsCoreIntent(core,intent,nowSeconds){
 if(!Array.isArray(core)||core.length<1||core.length>3||!Number.isSafeInteger(nowSeconds)||nowSeconds<30)fail();
 if(!['BTC','ETH','SOL'].includes(intent?.asset)||!['LONG','SHORT'].includes(intent?.side))fail();
 const side=intent.side==='LONG'?1:2,margin=BigInt(exactUsdUnits(intent.marginUsd)),reference=BigInt(exactUsdUnits(intent.referencePrice));
 const leverage=String(intent.leverage);
 if(!/^[1-9][0-9]?(\.[0-9])?$/.test(leverage)||!Number.isInteger(intent.maxSlippageBps)||intent.maxSlippageBps<1||intent.maxSlippageBps>100||margin<10000000n)fail();
 const [whole,fraction='0']=leverage.split('.'),tenths=BigInt(whole)*10n+BigInt(fraction);
 if(tenths<11n||tenths>500n)fail();
 const stopLoss=intent.stopLoss==null?null:BigInt(exactUsdUnits(intent.stopLoss));
 const takeProfit=intent.takeProfit==null?null:BigInt(exactUsdUnits(intent.takeProfit));
 for(const [price,profit] of [[stopLoss,false],[takeProfit,true]]){
  if(price!==null&&(price===reference||(price>reference)!==((side===1)===profit)))fail();
 }
 const decoded=core.map(decode),open=decoded[0],now=BigInt(nowSeconds);
 if(open.kind!=='INCREASE'||open.side!==side||open.size>margin*tenths/10n)fail();
 const cap=(reference*BigInt(side===1?10000+intent.maxSlippageBps:10000-intent.maxSlippageBps)+(side===1?9999n:0n))/10000n;
 if(side===1?open.price>cap:open.price<cap)fail();
 let sl=false,tp=false;
 for(let i=0;i<decoded.length;i++){
  const item=decoded[i];if(item.requestTime<now-30n||item.requestTime>now+2n)fail();
  if(i===0)continue;
  if(item.kind!=='TPSL'||item.entirePosition||item.collateral!==0n||item.size!==open.size)fail();
  const profit=item.triggerAbove===(side===1);
  if(profit){if(tp||takeProfit===null||item.price!==takeProfit)fail();tp=true;}
  else{if(sl||stopLoss===null||item.price!==stopLoss)fail();sl=true;}
 }
 if(sl!==(stopLoss!==null)||tp!==(takeProfit!==null))fail();
 return Object.freeze({stage:'CORE_INTENT_ONLY',readyForSigning:false,sizeUsdUnits:open.size.toString(),side:intent.side,exitCount:decoded.length-1});
}
// Cross-instruction consistency only. resolvedKeys MUST subsequently be bound
// to independently fetched lookup-table accounts and trusted custody/PDA state.
export function inspectServerPerpsBoundCore(envelope,resolvedKeys,intent,nowSeconds){
 if(envelope?.stage!=='STRUCTURE_ONLY'||!Array.isArray(resolvedKeys)||resolvedKeys.length!==envelope.accountCount
   ||!Array.isArray(envelope.staticKeys)||!Array.isArray(envelope.instructions))fail();
 for(let i=0;i<envelope.staticKeys.length;i++)if(resolvedKeys[i]!==envelope.staticKeys[i])fail();
 const core=[],exits=[];let opening=null;
 for(const instruction of envelope.instructions){
  if(envelope.staticKeys[instruction.program]!==PROGRAM)continue;
  const data=Buffer.from(instruction.dataBase64,'base64'),tag=data.subarray(0,8).toString('hex');
  if(tag==='e455b9704e4f4d02'||tag==='c52656a5c71726ea'){
   if(opening!==null||data.length!==(tag==='e455b9704e4f4d02'?8:24))fail();
   if(data.length===24&&(data.readBigUInt64LE(8)===0n||data.readBigUInt64LE(16)===0n))fail();
   continue; // Full pre-swap custody/ordering/ledger validation is still mandatory.
  }
  const parsed=decode(instruction.dataBase64),indices=instruction.accounts;
  if(!Array.isArray(indices)||indices.length!==20||indices[0]!==1||indices[1]!==2||indices[2]!==0)fail();
  if(indices.some(i=>!Number.isInteger(i)||i<0||i>=resolvedKeys.length))fail();
  const accounts=indices.map(i=>resolvedKeys[i]);if(accounts[19]!==PROGRAM)fail();
  if(parsed.kind==='INCREASE'){
   if(opening!==null||exits.length)fail();opening=accounts;
  }else{
   if(opening===null||exits.length>=2)fail();
   for(const [a,b] of [[0,0],[1,1],[2,2],[4,4],[5,5],[6,6],[7,9],[8,10],[9,11],[10,12],[16,15],[17,17],[18,18],[19,19]]){
    if(opening[a]!==accounts[b])fail();
   }
   if(accounts[7]===accounts[8]||accounts[7]===accounts[6]||accounts[8]===accounts[6]
      ||exits.some(e=>e[7]===accounts[7]||e[8]===accounts[8]))fail();
   exits.push(accounts);
  }
  core.push(instruction.dataBase64);
 }
 if(opening===null)fail();
 const checked=checkServerPerpsCoreIntent(core,intent,nowSeconds);
 return Object.freeze({...checked,stage:'BOUND_CORE_ONLY',requiresVerifiedChainAccounts:true,requiresFullInstructionPolicy:true,requiresSimulation:true});
}
