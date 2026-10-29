// Display-only sizing. Never a funding, fee or signing authorization.
export const SEND_SOL_RESERVE=5000000n;
export function sendPercentageAmount(amount,decimals,percent,{native=false}={}){
 if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(decimals)||decimals<0||decimals>18||!Number.isInteger(percent)||percent<1||percent>100)return null;
 // Public portfolio quantities are floating-point. Reject unsafe magnitudes
 // rather than round up beyond the observed balance or invent precision.
 const scaled=amount*10**decimals;if(!Number.isSafeInteger(Math.floor(scaled)))return null;
 let units=BigInt(Math.floor(scaled));if(native)units=units>SEND_SOL_RESERVE?units-SEND_SOL_RESERVE:0n;
 units=units*BigInt(percent)/100n;if(units<=0n)return null;
 const scale=10n**BigInt(decimals);return String(units/scale)+(decimals?'.'+String(units%scale).padStart(decimals,'0'):'');
}
