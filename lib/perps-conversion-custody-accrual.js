// Native Custody IDL SHA256:
// 1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
// Narrow tail comparison, not independent protocol-interest economics or
// signing authority. Fixed swap wire, vault deltas and wallet effects must
// still be validated independently.
function fail(){throw Error('PERPS_CONVERSION_CUSTODY_ACCRUAL_MISMATCH');}
const u128=(b,p)=>b.readBigUInt64LE(p)+(b.readBigUInt64LE(p+8)<<64n);
export function checkPerpsConversionCustodyAccrual(before,after,{nowSeconds}={}){
 if(!Buffer.isBuffer(before)||!Buffer.isBuffer(after)||before.length!==after.length||before.length<1117||!Number.isSafeInteger(nowSeconds)||nowSeconds<1)fail();
 // All configuration, oracle identities, impact parameters and extension
 // bytes stay exact. Only borrow interest, its clock, debt and accrued
 // interest can change in this tail.
 for(const [start,end]of [[286,972],[996,1004],[1036,before.length]])if(!before.subarray(start,end).equals(after.subarray(start,end)))fail();
 const priorTime=before.readBigInt64LE(988),nextTime=after.readBigInt64LE(988),at=BigInt(nowSeconds);
 const rateBefore=u128(before,972),rateAfter=u128(after,972),debtBefore=u128(before,1004),debtAfter=u128(after,1004),feesBefore=u128(before,1020),feesAfter=u128(after,1020);
 if(priorTime<0n||nextTime<priorTime||nextTime>at+2n||rateAfter<rateBefore||debtAfter<debtBefore||feesAfter<feesBefore||debtAfter-debtBefore!==feesAfter-feesBefore)fail();
 // No new principal can appear in a swap. Accrual must advance both the
 // clock and interest index; an unchanged index cannot manufacture debt.
 const debtDelta=debtAfter-debtBefore;
 if(nextTime===priorTime&&(rateAfter!==rateBefore||debtDelta!==0n)||rateAfter===rateBefore&&debtDelta!==0n)fail();
 return Object.freeze({borrowInterestIndexDelta:(rateAfter-rateBefore).toString(),borrowDebtInterestDelta:debtDelta.toString()});
}
