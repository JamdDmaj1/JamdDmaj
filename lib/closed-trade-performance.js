// Read-only cash result in USDC, NOT total USD PnL. SOL fees/rent are excluded.
const MAX=18446744073709551615n;
const units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=MAX;
const signed=v=>typeof v==='string'&&/^(0|-?[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)>=-MAX&&BigInt(v)<=MAX;
const abs=v=>v<0n?-v:v;
function roundedBps(result,margin){const scaled=abs(result)*10000n,q=scaled/margin,r=scaled%margin;return ((result<0n?-1n:1n)*(q+(r*2n>=margin?1n:0n))).toString();}
export function performanceFromTotals(margin,fees,received){
 if(!units(margin)||BigInt(margin)===0n||!units(fees)||!units(received)||BigInt(margin)+BigInt(fees)>MAX)return null;
 const result=BigInt(received)-BigInt(margin)-BigInt(fees);
 return Object.freeze({version:1,basisUsdcUnits:margin,openingPlatformFeeUsdcUnits:fees,resultUsdcUnits:result.toString(),returnBps:roundedBps(result,BigInt(margin)),excludesSolNetworkCosts:true});
}
export function closedTradePerformance(snapshot,received){
 try{
  const {close,entries}=snapshot,s=JSON.parse(close.settlement);
  if(close.state!=='COMPLETED'||s.version!==2||!units(s.sizeUsdUnits)||!units(received)||!Array.isArray(entries)||!entries.length)return null;
  let margin=0n,fees=0n,size=0n;const ids=new Set();
  for(const row of entries){
   if(!row||ids.has(row.reservation)||row.state!=='CLOSED'||row.wallet!==close.wallet||row.position_address!==close.position||row.signal!=='manual:'+row.reservation
    ||!Number.isSafeInteger(row.margin)||row.margin<=0||!Number.isSafeInteger(row.platform_fee_units)||row.platform_fee_units<0)return null;
   ids.add(row.reservation);const plan=JSON.parse(row.entry_exit_plan);if(!units(plan.sizeUsdUnits)||BigInt(plan.sizeUsdUnits)===0n)return null;
   margin+=BigInt(row.margin);fees+=BigInt(row.platform_fee_units);size+=BigInt(plan.sizeUsdUnits);
  }
  // Do not infer a full-generation cash result after unaccounted partial exits
  // or additions. Only the exactly matched complete signed entry size qualifies.
  if(size!==BigInt(s.sizeUsdUnits))return null;
  return performanceFromTotals(margin.toString(),fees.toString(),received);
 }catch{return null;}
}
export function validClosedTradePerformance(value,received,state){
 if(value===null||value===undefined)return true;
 if(state!=='COMPLETED'||!value||Object.keys(value).sort().join(',')!=='basisUsdcUnits,excludesSolNetworkCosts,openingPlatformFeeUsdcUnits,resultUsdcUnits,returnBps,version'||value.version!==1||value.excludesSolNetworkCosts!==true||!signed(value.resultUsdcUnits))return false;
 const expected=performanceFromTotals(value.basisUsdcUnits,value.openingPlatformFeeUsdcUnits,received);
 return !!expected&&expected.resultUsdcUnits===value.resultUsdcUnits&&expected.returnBps===value.returnBps;
}
export function formatTradeUnits(value,{digits=2,signedValue=false,language='es'}={}){
 const n=BigInt(value),m=abs(n),factor=10n**BigInt(6-digits),rounded=(m+factor/2n)/factor,base=10n**BigInt(digits);
 return (n<0n?'-':signedValue&&n>0n?'+':'')+(rounded/base).toString()+(digits?(language==='es'?',':'.')+(rounded%base).toString().padStart(digits,'0'):'');
}
export function formatTradePercent(bps,language='es'){
 const n=BigInt(bps),m=abs(n);return (n<0n?'-':n>0n?'+':'')+(m/100n).toString()+(language==='es'?',':'.')+(m%100n).toString().padStart(2,'0')+'%';
}
