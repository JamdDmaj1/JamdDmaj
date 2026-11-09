// Closed history as a first-class card: it must stay visible without opening
// the bot positions details.
import {createBotManualPerpsClient} from './bot-manual-perps-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {setupBotClosedHistoryPanel} from './bot-closed-history-panel.js';

export function setupFuturesHistoryCard(parent,{doc,language='es'}={}){
  if(!parent)return {refresh:async()=>{},dispose(){}};
  const win=doc.defaultView||globalThis;
  const client=createBotManualPerpsClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
  return setupBotClosedHistoryPanel(parent,{doc,language,client});
}
