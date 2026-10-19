// One-shot read-only VPS diagnostic. No custody key, activation or send path.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
export async function inspectPerpsDailyAccount(walletAddress,{request=createServerPerpsReadOnlyRpc()}={}){
 const value=await readServerPerpsDailyAccount({walletAddress},{request});
 return Object.freeze({stage:'READ_ONLY_PERPS_DAILY_ACCOUNT_CHECK',walletAddress:value.walletAddress,day:value.day,observedSlot:value.observedSlot,
  historyThroughSlot:value.historyThroughSlot,availableUsdcUnits:value.availableUsdcUnits,allocatedUsdcUnits:value.allocatedUsdcUnits,
  openPositions:value.openPositions,tradesToday:value.tradesToday,lossTodayUsdcUnits:value.lossTodayUsdcUnits,
  balancesComplete:value.balancesComplete,tradingEnabled:false,readyForSigning:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await inspectPerpsDailyAccount(process.argv[2])));}
 catch{console.error('PERPS_READ_ONLY_DAILY_ACCOUNT_CHECK_FAILED');process.exitCode=1;}
}
