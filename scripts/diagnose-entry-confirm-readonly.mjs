// Diagnostic only: unsigned preparation + repeated simulation. No signer or send.
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {prepareProtectedPerpsEntryConversion,readPreparedPerpsEntryConversion} from '../lib/perps-entry-conversion-preparation.js';
import {simulatePerpsEntryConversion} from '../lib/perps-entry-conversion-simulation.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
let stage='configuration';
try{
 const env=Object.fromEntries(readFileSync('/proc/'+process.argv[2]+'/environ','utf8').split('\0').filter(Boolean).map(v=>{const at=v.indexOf('=');return [v.slice(0,at),v.slice(at+1)];}));
 const request=createServerPerpsReadOnlyRpc({url:env.JAMDDMAJ_PERPS_RPC_URL||'https://api.mainnet-beta.solana.com'});
 const db=new DatabaseSync('/var/lib/private/jamddmaj-perps-runtime/journal.sqlite',{readOnly:true});
 let row;try{row=db.prepare('SELECT p.wallet,h.draft_json FROM perps_entry_conversion_holds h JOIN perps_reservations p ON p.reservation=h.reservation ORDER BY h.created DESC LIMIT 1').get();}finally{db.close();}
 if(!row)throw Error('NO_RECORDED_ENTRY_CONVERSION');const draft=JSON.parse(row.draft_json);
 stage='reference';const response=await fetch('https://perps-api.jup.ag/v1/market-stats?mint='+PERPS_CUSTODIES[draft.asset].mint);if(!response.ok)throw Error('REFERENCE_UNAVAILABLE');const market=await response.json();draft.referencePrice=Number(market.price).toFixed(6);
 stage='unsigned-preparation';const prepared=await prepareProtectedPerpsEntryConversion(draft,row.wallet,{request});console.log(JSON.stringify({stage,ok:true}));
 stage='confirm-resimulation';const proof=readPreparedPerpsEntryConversion(prepared),result=await simulatePerpsEntryConversion(proof.wire,{request,minimumSlot:prepared.observedSlot});
 console.log(JSON.stringify({stage,ok:true,costsUnchanged:result.networkFeeLamports===prepared.networkFeeLamports&&result.rentLockedLamports===prepared.rentLockedLamports,submitted:false}));
}catch(error){console.log(JSON.stringify({stage,ok:false,code:/^[A-Z_]{1,100}$/.test(error.message)?error.message:'DIAGNOSTIC_UNAVAILABLE'}));process.exitCode=1;}
