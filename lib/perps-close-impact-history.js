// Confirmed program-owned Anchor IDL SHA256 1d90a653...dc6f7d653:
// Custody.priceImpactBuffer = i64[60] at 416, i64 clock at 896,
// immutable fee configuration from 904 onward. Display data is never used here.
const fail=(diagnosticStage='impact-layout')=>{throw Object.assign(Error('PERPS_CLOSE_IMPACT_HISTORY_MISMATCH'),{diagnosticStage});};
import {checkPerpsConversionCustodyAccrual} from './perps-conversion-custody-accrual.js';
// Compose two independently validated transitions. Masking is confined to the
// OTHER validator's exact ranges; no byte is exempt from both validators.
export function checkPerpsCloseCustodyTail(before,after,options){
 if(!Buffer.isBuffer(before)||!Buffer.isBuffer(after)||before.length!==after.length)fail();
 const impactAfter=Buffer.from(after);
 if(!before.subarray(972).equals(after.subarray(972))){
  const accrualAfter=Buffer.from(after);before.copy(accrualAfter,416,416,Math.min(904,before.length));
  try{checkPerpsConversionCustodyAccrual(before,accrualAfter,{nowSeconds:options?.nowSeconds});}
  catch{throw Error('PERPS_CLOSE_BORROW_ACCRUAL_MISMATCH');}
  before.copy(impactAfter,972,972,996);before.copy(impactAfter,1004,1004,1036);
 }
 checkPerpsCloseImpactHistory(before,impactAfter,options);
}
export function checkPerpsCloseImpactHistory(before,after,{sizeUsdUnits,requestTimeSeconds,isMarket,side,nowSeconds}={}){
 if(!Buffer.isBuffer(before)||!Buffer.isBuffer(after)||before.length!==after.length||before.length<416
  ||!before.subarray(286,416).equals(after.subarray(286,416)))fail();
 if(before.subarray(416).equals(after.subarray(416)))return;
 if(isMarket!==true)fail('impact-non-market-change');
 if(!before.subarray(904).equals(after.subarray(904)))fail('impact-configuration-tail');
 if(!['LONG','SHORT'].includes(side)||before.length<932
  ||typeof sizeUsdUnits!=='string'||!/^[1-9][0-9]{0,19}$/.test(sizeUsdUnits)
  ||typeof requestTimeSeconds!=='string'||!/^[1-9][0-9]{0,18}$/.test(requestTimeSeconds)||!Number.isSafeInteger(nowSeconds)||nowSeconds<30)fail();
 const size=BigInt(sizeUsdUnits),oldTime=before.readBigInt64LE(896),time=after.readBigInt64LE(896),request=BigInt(requestTimeSeconds);
 if(size>9223372036854775807n||oldTime<0n||time<oldTime||time<request-30n||time>request+30n||time<BigInt(nowSeconds)-30n||time>BigInt(nowSeconds)+2n)fail('impact-clock');
 const elapsed=time-oldTime,index=Number(time%60n),previousIndex=Number(oldTime%60n);
 const expected=Array.from({length:60},(_,i)=>before.readBigInt64LE(416+i*8));
 if(oldTime===0n||elapsed>=60n)expected.fill(0n);
 else for(let step=1;step<=Number(elapsed);step++)expected[(previousIndex+step)%60]=0n;
 expected[index]=(elapsed===0n&&oldTime!==0n?expected[index]:0n)+(side==='SHORT'?size:-size);
 if(expected[index]< -9223372036854775808n||expected[index]>9223372036854775807n)fail();
 for(let i=0;i<60;i++)if(after.readBigInt64LE(416+i*8)!==expected[i])fail(i===index?(after.readBigInt64LE(416+i*8)===expected[i]+2n*size?'impact-positive-delta':'impact-current-delta'):'impact-history');
}
