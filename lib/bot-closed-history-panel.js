import {selectedWalletAccount} from './wallet-portfolio-store.js';

export function setupBotClosedHistoryPanel(parent,{doc,language,client}={}){
 const t=(es,en)=>language==='es'?es:en;
 const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='card bot-closed-history';
 panel.append(node('h3',t('Historial de operaciones cerradas','Closed trade history')));
 const refresh=node('button',t('Actualizar historial','Refresh history')),status=node('p'),list=node('div');
 refresh.type='button';status.setAttribute('role','status');panel.append(refresh,status,list);parent.append(panel);
 let disposed=false,generation=0,current=null;
 const wallet=()=>{const a=selectedWalletAccount(doc);return a?.source==='watch'?a.address:null;};
 const amount=value=>{const n=BigInt(value),whole=n/1000000n,fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'')+' USDC';};
 async function reload(){
  const address=wallet(),ticket=++generation;list.textContent='';panel.hidden=!address;if(!address||disposed)return;
  refresh.disabled=true;status.textContent=t('Consultando cierres verificados…','Reading verified closes…');
  try{
   const data=await client.history(address);if(disposed||ticket!==generation||wallet()!==address)return;
   for(const item of data.items){
    const row=node('article');row.className='card';
    row.append(node('h4',item.asset+' · '+item.side),node('p',new Date(item.closedAt).toLocaleString(language==='es'?'es':'en')));
    row.append(node('p',item.state==='COMPLETED'?t('Cierre conciliado','Close reconciled'):t('Cerrada en red · conciliación pendiente','Closed on-chain · accounting pending')));
    row.append(node('p',item.receivedUsdcUnits===null?t('Importe en USDC pendiente de conversión','USDC proceeds pending conversion'):t('Importe recibido: ','Proceeds received: ')+amount(item.receivedUsdcUnits)));
    row.append(node('p',t('Ganancia/pérdida neta: no calculada. El importe recibido no representa la ganancia.','Net profit/loss: not calculated. Proceeds are not profit.')));
    const link=node('a',t('Ver cierre en Solana','View close on Solana'));link.href='https://solscan.io/tx/'+encodeURIComponent(item.firstLegSignature);link.target='_blank';link.rel='noopener noreferrer';row.append(link);list.append(row);
   }
   status.textContent=data.items.length?(data.hasMore?t('Se muestran los 50 cierres más recientes.','Showing the 50 most recent closes.'):t('Cierres verificados de esta billetera.','Verified closes for this wallet.')):t('Todavía no hay cierres verificados registrados para esta billetera.','No verified closes recorded for this wallet yet.');
  }catch{if(!disposed&&ticket===generation)status.textContent=t('No se pudo consultar el historial. Vuelve a actualizar; no se enviará ninguna orden.','History unavailable. Refresh again; no order will be sent.');}
  finally{if(!disposed&&ticket===generation)refresh.disabled=false;}
 }
 function changed(){const address=wallet();if(address===current)return;current=address;void reload();}
 refresh.onclick=()=>void reload();doc.addEventListener?.('jamd-wallet-portfolio',changed);changed();panel.hidden=!wallet();
 return {refresh:reload,dispose(){disposed=true;generation++;doc.removeEventListener?.('jamd-wallet-portfolio',changed);panel.remove?.();}};
}
