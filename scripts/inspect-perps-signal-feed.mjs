#!/usr/bin/env node
// A one-shot, read-only VPS deployment check. No daemon, activation, signing,
// executor heartbeat, scanner cycle, Telegram send or provider execution endpoint.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readServerPerpsSignalFeed} from '../lib/perps-server-signal-feed.js';
export async function inspectPerpsSignalFeed({feedToken},dependencies){
 const result=await readServerPerpsSignalFeed({feedToken},dependencies);
 return Object.freeze({stage:'READ_ONLY_SIGNAL_FEED_CHECK',available:true,remotePaused:result.remotePaused,
  eligiblePublishedSignals:result.candidates.length,rejected:result.rejected,observedAt:result.observedAt,
  tradingEnabled:false,readyForSigning:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 inspectPerpsSignalFeed({feedToken:process.env.JAMDDMAJ_CLIENT_FEED_TOKEN}).then(result=>{
  console.log(JSON.stringify(result));
 }).catch(()=>{console.error('PERPS_SIGNAL_FEED_CHECK_FAILED');process.exitCode=1;});
}
