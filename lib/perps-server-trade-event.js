// Decode pinned program IDL events, not API P/L strings. A decoded payload is
// NOT proof it was emitted on chain; the transaction reader must bind its origin.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import layout from './perps-event-layout.json' with {type:'json'};
import {PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
const events=new Map(layout.events.map(event=>[createHash('sha256').update('event:'+event.name).digest('hex').slice(0,16),structuredClone(event)]));
function fail(){throw Error('INVALID_SERVER_PERPS_TRADE_EVENT');}
export async function decodeServerPerpsTradeEvent(payload,{walletAddress}={}){
 if(!(payload instanceof Uint8Array)||payload.length<8||payload.length>2048)fail();
 const data=Buffer.from(payload),schema=events.get(data.subarray(0,8).toString('hex'));
 if(!schema)return null;
 let offset=8;
 function read(type){
  if(type&&typeof type==='object'&&Object.keys(type).length===1&&Object.hasOwn(type,'option')){
   const tag=read('u8');if(tag>1)fail();return tag?read(type.option):null;
  }
  const size={publicKey:32,u8:1,u64:8,i64:8,bool:1}[type];if(!size||offset+size>data.length)fail();
  const start=offset;offset+=size;
  if(type==='publicKey')return bs58.encode(data.subarray(start,offset));
  if(type==='u64')return data.readBigUInt64LE(start).toString();
  if(type==='i64')return data.readBigInt64LE(start).toString();
  if(type==='bool'){if(data[start]>1)fail();return data[start]===1;}
  return data[start];
 }
 const fields={};for(const [name,type]of schema.fields)fields[name]=read(type);
 if(offset!==data.length||fields.owner!==walletAddress||fields.pool!==PERPS_POOL||![1,2].includes(fields.positionSide))fail();
 const asset=['BTC','ETH','SOL'].find(asset=>PERPS_CUSTODIES[asset].mint===fields.positionMint),side=fields.positionSide===1?'LONG':'SHORT';
 if(!asset)fail();const collateral=PERPS_CUSTODIES[side==='LONG'?asset:'USDC'];
 if(fields.positionCustody!==PERPS_CUSTODIES[asset].address||fields.positionCollateralCustody!==collateral.address
   ||(fields.positionCollateralMint!==undefined&&fields.positionCollateralMint!==collateral.mint))fail();
 const identities=await deriveServerPerpsIdentities({walletAddress,asset,side});if(fields.positionKey!==identities.position)fail();
 const action=/Increase/.test(schema.name)?'Increase':/Liquidate/.test(schema.name)?'Liquidate':'Decrease';
 const signedPnl=action==='Increase'?0n:BigInt(fields.pnlDelta)*(fields.hasProfit?1n:-1n);
 const fee=BigInt(fields.feeUsd),components=['positionFeeUsd','fundingFeeUsd','priceImpactFeeUsd','liquidationFeeUsd'].reduce((sum,name)=>sum+BigInt(fields[name]??'0'),0n);
 // Keep original fields. For the risk ceiling only, do not assume aggregate
 // feeUsd excludes/includes components, or let profitable trades erase losses.
 const upperFees=fee>components?fee:components;
 let upperLoss=(signedPnl<0n?-signedPnl:0n)+upperFees;
 if(action==='Liquidate'){
  const unrecovered=BigInt(fields.originalPositionCollateralUsd)-BigInt(fields.transferAmountUsd);
  if(unrecovered>upperLoss)upperLoss=unrecovered;
 }
 return Object.freeze({stage:'DECODED_EVENT_ONLY',readyForSigning:false,eventName:schema.name,walletAddress,asset,side,action,
  positionAddress:fields.positionKey,signedPnlUsdUnits:signedPnl.toString(),feeUsdUnits:fee.toString(),feeComponentsUsdUnits:components.toString(),
  conservativeLossUsdUnits:upperLoss.toString(),fields:Object.freeze(fields),requiresVerifiedChainOrigin:true});
}
