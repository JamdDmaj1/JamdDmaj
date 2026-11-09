// Closed history as a first-class card: it must stay visible without opening
// the bot positions details.
import {createBotManualPerpsClient} from './bot-manual-perps-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {setupBotClosedHistoryPanel} from './bot-closed-history-panel.js';
import {createPhoenixManualClient} from './phoenix-manual-client.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';

export function setupFuturesHistoryCard(parent,{doc,language='es',getWallet}={}){
  if(!parent)return {refresh:async()=>{},dispose(){}};
  const win=doc.defaultView||globalThis;
  const client=createBotManualPerpsClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
  const panel=setupBotClosedHistoryPanel(parent,{doc,language,client});
  const phoenix=createPhoenixManualClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
  const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const venue=node('div');venue.className='bch-phoenix';parent.append(venue);
  const renderVenue=async()=>{
   venue.replaceChildren();
   const wallet=getWallet?getWallet():selectedWalletAccount(doc)?.address;
   if(!wallet){venue.append(node('small',language==='es'?'Selecciona la billetera para ver los cierres de Phoenix.':'Select the wallet to see Phoenix closes.'));return;}
   try{
    const data=await phoenix.history(wallet);
    const items=(data.items||[]).slice().sort((a,b)=>(b.closedAt||0)-(a.closedAt||0));
    venue.append(node('h3',language==='es'?'Cierres de Phoenix':'Phoenix closes'));
    if(!items.length){venue.append(node('small',language==='es'?'Sin operaciones cerradas en Phoenix.':'No closed Phoenix trades.'));return;}
    for(const item of items.slice(0,8)){
     const row=node('div');row.className='bch-row';
     const received=Number(item.receivedUsdcUnits??0)/1e6, margin=Number(item.marginUsdcUnits??0)/1e6;
     const profit=item.netPnlUsdcUnits!=null?Number(item.netPnlUsdcUnits)/1e6:received-margin;
     const when=item.closedAt?new Date(item.closedAt).toLocaleString(language):'';
     row.append(node('strong',item.symbol+' · '+(item.state||'')),node('span',(profit>0?'+':'')+profit.toLocaleString(language,{maximumFractionDigits:2})+' USD'),node('small',when+' · '+(language==='es'?'recibido ':'received ')+received.toLocaleString(language,{maximumFractionDigits:2})+' USDC'));
     venue.append(row);
    }
   }catch(error){venue.append(node('small',(language==='es'?'No se pudo leer el historial de Phoenix: ':'Could not read the Phoenix history: ')+String(error?.message||error).slice(0,60)));}
  };
  void renderVenue();
  let tries=0;const retry=setInterval(()=>{if((getWallet?getWallet():selectedWalletAccount(doc)?.address)||++tries>10){clearInterval(retry);return;}void renderVenue();},2000);retry?.unref?.();
  doc.addEventListener?.('jamd-phoenix-changed',()=>{void renderVenue();});
  doc.addEventListener?.('jamd-wallet-portfolio',()=>{void renderVenue();});
  doc.addEventListener?.('jamd-trading-state',()=>{void renderVenue();});
  return {refresh:async()=>{await panel.refresh?.();await renderVenue();},dispose(){panel.dispose?.();}};
}
