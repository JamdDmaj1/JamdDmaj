// Canonical persistence format for the exact size and individually simulated
// exit requests. It carries no chain provenance or signing authority itself.
import bs58 from 'bs58';
function fail(){throw Error('INVALID_PERPS_ENTRY_EXIT_PLAN');}
function positive(value){if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value)||BigInt(value)>18446744073709551615n)fail();return value;}
function address(value){try{if(typeof value!=='string'||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)fail();return value;}catch{fail();}}
export function canonicalServerPerpsEntryExitPlan(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['sizeUsdUnits','exits'].includes(k))||!Array.isArray(value.exits)||value.exits.length>2)fail();
 const sizeUsdUnits=positive(value.sizeUsdUnits),seen=new Set(),kinds=new Set();
 const exits=value.exits.map(exit=>{
  if(!exit||typeof exit!=='object'||Array.isArray(exit)||Object.keys(exit).some(k=>!['address','kind','sizeUsdUnits','triggerPriceUsdUnits','counter'].includes(k)))fail();
  const key=address(exit.address);if(seen.has(key)||!['SL','TP'].includes(exit.kind)||kinds.has(exit.kind)||positive(exit.sizeUsdUnits)!==sizeUsdUnits)fail();
  if(typeof exit.counter!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(exit.counter)||BigInt(exit.counter)>18446744073709551615n)fail();
  seen.add(key);kinds.add(exit.kind);return {address:key,kind:exit.kind,sizeUsdUnits,triggerPriceUsdUnits:positive(exit.triggerPriceUsdUnits),counter:exit.counter};
 }).sort((a,b)=>a.kind.localeCompare(b.kind));
 return JSON.stringify({sizeUsdUnits,exits});
}
