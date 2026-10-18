// Decode program-owned position snapshots and compare simulated effects with
// the exact approved increase. Does not authorize a transaction or trust that
// the caller's account snapshots came from the same-wire simulation.
import bs58 from 'bs58';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const positions=new WeakSet();
function fail(){throw Error('PERPS_POSITION_EFFECT_MISMATCH');}
function unsigned(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value)||BigInt(value)>18446744073709551615n)fail();return BigInt(value);}
export async function decodeServerPerpsPosition(address,account,intent){
 if(account?.owner!==PERPS_PROGRAM||account.executable!==false||!Array.isArray(account.data)||account.data.length!==2
   ||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>5464)fail();
 const data=Buffer.from(account.data[0],'base64');
 if(data.toString('base64')!==account.data[0]||data.length<210||data.length>4096||data.subarray(0,8).toString('hex')!=='aabc8fe47a40f7d0')fail();
 const expected=await deriveServerPerpsIdentities(intent),side=intent.side==='LONG'?1:2;
 if(address!==expected.position||data[209]!==expected.positionBump||data[152]!==side)fail();
 for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES[intent.asset].address],[104,PERPS_CUSTODIES[side===1?intent.asset:'USDC'].address]]){
  if(bs58.encode(data.subarray(offset,offset+32))!==key)fail();
 }
 if(data.subarray(210).some(n=>n!==0))fail();
 const openTime=data.readBigUInt64LE(136),updateTime=data.readBigUInt64LE(144),price=data.readBigUInt64LE(153),size=data.readBigUInt64LE(161),collateral=data.readBigUInt64LE(169);
 if(openTime>9223372036854775807n||updateTime>9223372036854775807n||updateTime<openTime||(size>0n&&(openTime===0n||price===0n||collateral===0n)))fail();
 const value=Object.freeze({address,walletAddress:intent.walletAddress,asset:intent.asset,side:intent.side,openTimeSeconds:openTime.toString(),updateTimeSeconds:updateTime.toString(),
  priceUsdUnits:price.toString(),sizeUsdUnits:size.toString(),collateralUsdUnits:collateral.toString()});
 positions.add(value);return value;
}
export function checkServerPerpsPositionIncrease(before,after,intent,openingSizeUsdUnits){
 if(!positions.has(after)||(before!==null&&!positions.has(before))||after.walletAddress!==intent?.walletAddress||after.asset!==intent.asset||after.side!==intent.side
   ||(before!==null&&(before.address!==after.address||BigInt(after.updateTimeSeconds)<BigInt(before.updateTimeSeconds))))fail();
 const leverage=String(intent.leverage);if(!/^[1-9][0-9]?(\.[0-9])?$/.test(leverage)||!Number.isInteger(intent.maxSlippageBps)||intent.maxSlippageBps<1||intent.maxSlippageBps>100)fail();
 const [whole,fraction='0']=leverage.split('.'),tenths=BigInt(whole)*10n+BigInt(fraction),margin=BigInt(exactUsdUnits(intent.marginUsd)),opening=unsigned(openingSizeUsdUnits);
 if(tenths<11n||tenths>500n||margin<10000000n||opening===0n)fail();
 const size=BigInt(after.sizeUsdUnits)-(before===null?0n:BigInt(before.sizeUsdUnits));
 const collateral=BigInt(after.collateralUsdUnits)-(before===null?0n:BigInt(before.collateralUsdUnits));
 if(size!==opening||size>margin*tenths/10n||collateral<=0n||collateral>margin
   ||size*100000n>collateral*tenths*BigInt(10000+intent.maxSlippageBps)
   ||size*100000n<collateral*tenths*BigInt(10000-intent.maxSlippageBps))fail();
 return Object.freeze({stage:'POSITION_EFFECTS_ONLY',readyForSigning:false,sizeDeltaUsdUnits:size.toString(),collateralDeltaUsdUnits:collateral.toString()});
}
