// Read-only recovery of the EXACT recorded second-leg signature. Reconstruction
// uses the native constructor, not a JSON-to-private-proof shortcut. No signing,
// replacement wire/blockhash, resubmission, activation or capital release.
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {buildUnsignedPerpsCloseConversionWire} from './perps-close-conversion-wire.js';
import {storedPerpsCloseConversionWire} from './perps-close-conversion-record.js';
import {readFinalizedPerpsCloseConversionReceipt} from './perps-close-conversion-receipt.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
function fail(){throw Error('PERPS_CLOSE_CONVERSION_RECOVERY_UNAVAILABLE');}
export async function recoverRecordedPerpsCloseConversion(journal,id,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const snapshot=journal.readPositionCloseConversionSettlement(id),encoded=JSON.stringify(snapshot),row=snapshot.conversion;
 if(!['UNCERTAIN','FINALIZED'].includes(row.state))fail();
 const current=()=>{if(JSON.stringify(journal.readPositionCloseConversionSettlement(id))!==encoded)fail();};
 const guarded=async(m,p)=>{current();const value=await request(m,p);current();return value;};
 if(await guarded('getGenesisHash',[])!==GENESIS)fail();
 const stored=JSON.parse(row.wire_json),c=PERPS_CUSTODIES[stored.asset],u=PERPS_CUSTODIES.USDC;
 const reply=await guarded('getMultipleAccounts',[[c.address,u.address],{encoding:'base64',commitment:'finalized',minContextSlot:row.prepared_slot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<row.prepared_slot||!Array.isArray(reply.value)||reply.value.length!==2)fail();
 const collateral=decodeServerPerpsCustody(stored.asset,c.address,reply.value[0]),usdc=decodeServerPerpsCustody('USDC',u.address,reply.value[1]);
 const wire=await buildUnsignedPerpsCloseConversionWire(stored,collateral,usdc);current();
 // Includes the original blockhash, minimum, amount, owner, roles and cleanup.
 // Current native configuration must rebuild the exact historical message.
 if(storedPerpsCloseConversionWire(wire)!==row.wire_json)fail();
 const payout=await readFinalizedPerpsCloseConversionReceipt(wire,{signature:row.signature,wireHash:row.wire_hash,createdAt:row.created,minimumSlot:row.prepared_slot},
  {request:guarded,now,monotonicNow});current();
 if(payout===null)return Object.freeze({stage:'RECORDED_CONVERSION_AWAITING_FINALITY',readyForSigning:false,tradingEnabled:false,closeId:id,signature:row.signature});
 const result=journal.reconcilePositionCloseConversion(id,payout);
 return Object.freeze({stage:'RECORDED_CONVERSION_FINALIZED',readyForSigning:false,tradingEnabled:false,closeId:id,signature:row.signature,
  receivedUsdcUnits:payout.receivedUsdcUnits,execution:result,requiresCompleteDailyAccounting:true});
}
