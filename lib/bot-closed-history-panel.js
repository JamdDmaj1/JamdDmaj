import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {validClosedTradePerformance,formatTradeUnits,formatTradePercent} from './closed-trade-performance.js';
import {openTradeShareDialog} from './trade-share-dialog.js';
export function setupBotClosedHistoryPanel(parent,{doc,language='es',client}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const panel=node('section',null,'card bot-closed-history'),header=node('div',null,'bch-header'),heading=node('div');
 heading.append(node('span',t('TU HISTORIAL','YOUR JOURNAL'),'bch-eyebrow'),node('h3',t('Operaciones cerradas','Closed trades')));
 const refresh=node('button',t('Actualizar historial','Refresh history'),'bch-refresh'),status=node('p',null,'bch-status'),list=node('div',null,'bch-list');
 refresh.type='button';status.setAttribute('role','status');header.append(heading,refresh);panel.append(header,status,list);parent.append(panel);
 let disposed=false,generation=0,current=null,closeShare=null;
 const wallet=()=>{const a=selectedWalletAccount(doc);return a?.source==='watch'?a.address:null;};
 const fmt=(v,signed=false)=>formatTradeUnits(v,{language,signedValue:signed,digits:signed&&BigInt(v)!==0n&&BigInt(v)>-10000n&&BigInt(v)<10000n?6:2});
 function shareImage(item,sourceButton){
  closeShare?.();const address=wallet();if(!address)return;
  closeShare=openTradeShareDialog({doc,language,item,sourceButton,isCurrent:()=>!disposed&&wallet()===address,onClose:()=>{closeShare=null;},restoreFocus:()=>refresh.focus?.()});
 }
 function card(item){
  const p=item.performance&&validClosedTradePerformance(item.performance,item.receivedUsdcUnits,item.state)?item.performance:null;
  const result=p?BigInt(p.resultUsdcUnits):null,tone=result===null||result===0n?'neutral':result>0n?'positive':'negative';
  const row=node('article',null,'bch-trade bch-'+tone),top=node('div',null,'bch-trade-top'),name=node('div',null,'bch-name');
  name.append(node('span',item.asset.slice(0,1),'bch-coin'),node('strong',item.asset+' / USDC'),node('span',item.side,'bch-side bch-side-'+item.side.toLowerCase()));
  top.append(name,node('span',item.state==='COMPLETED'?t('✓ Conciliado','✓ Reconciled'):t('Conciliación pendiente','Accounting pending'),'bch-state'));row.append(top);
  const hero=node('div',null,'bch-result');hero.append(node('span',p?t('RESULTADO EN USDC · SIN COSTES SOL','USDC RESULT · EXCLUDING SOL COSTS'):t('RESULTADO NO DISPONIBLE','RESULT UNAVAILABLE'),'bch-eyebrow'));
  const figures=node('div',null,'bch-figures');figures.append(node('strong',p?fmt(p.resultUsdcUnits,true)+' USDC':'—'),node('span',p?formatTradePercent(p.returnBps,language):'—','bch-percent'));hero.append(figures,node('small',p?(result>0n?t('↑ Ganancia sobre el margen aportado','↑ Gain on contributed margin'):result<0n?t('↓ Pérdida sobre el margen aportado','↓ Loss on contributed margin'):t('Sin variación sobre el margen aportado','No change on contributed margin')):t('Faltan datos conciliados para calcularlo; no se muestra como cero.','Reconciled data is missing; this is not shown as zero.')));row.append(hero);
  const details=node('details',null,'bch-details');details.append(node('summary',t('Desglose de la operación','Trade breakdown')));const grid=node('dl');
  for(const [label,value]of [[t('Margen aportado','Contributed margin'),p?fmt(p.basisUsdcUnits)+' USDC':'—'],[t('Comisión de apertura registrada','Recorded opening platform fee'),p?formatTradeUnits(p.openingPlatformFeeUsdcUnits,{digits:4,language})+' USDC':'—'],[t('Importe recibido al cerrar','Proceeds received at close'),item.receivedUsdcUnits===null?'—':formatTradeUnits(item.receivedUsdcUnits,{digits:6,language})+' USDC'],[t('Fecha de cierre','Closed at'),new Date(item.closedAt).toLocaleString(language==='es'?'es':'en')]]){grid.append(node('dt',label),node('dd',value));}
  details.append(grid,node('p',t('Recibir capital no es ganarlo. El resultado resta el margen registrado y la comisión de apertura; no incluye costes de red ni rentas en SOL.','Proceeds are not profit. Result subtracts recorded margin and opening platform fee; it excludes SOL network costs and account rent.'),'bch-help'));row.append(details);
  const footer=node('div',null,'bch-footer'),button=node('button',t('↗ Compartir resultado','↗ Share result'),'bch-primary'),link=node('a',t('Ver cierre en Solana','View close on Solana'),'bch-explorer');button.type='button';button.onclick=()=>shareImage(item,button);link.href='https://solscan.io/tx/'+encodeURIComponent(item.firstLegSignature);link.target='_blank';link.rel='noopener noreferrer';footer.append(button,link);row.append(footer);return row;
 }
 async function reload(){
  const address=wallet(),ticket=++generation;closeShare?.();list.textContent='';panel.hidden=!address;if(!address||disposed)return;
  refresh.disabled=true;status.textContent=t('Consultando cierres verificados…','Reading verified closes…');
  try{const data=await client.history(address);if(disposed||ticket!==generation||wallet()!==address)return;
   for(const item of data.items)list.append(card(item));status.textContent=data.items.length?(data.hasMore?t('Últimas 50 operaciones registradas.','Latest 50 recorded trades.'):data.items.length+' '+t('operaciones cerradas registradas.','recorded closed trades.')):t('Todavía no hay cierres verificados registrados para esta billetera.','No verified closes recorded for this wallet yet.');
  }catch{if(!disposed&&ticket===generation)status.textContent=t('No se pudo consultar el historial. Actualizar no envía órdenes.','History unavailable. Refreshing does not send orders.');}
  finally{if(!disposed&&ticket===generation)refresh.disabled=false;}
 }
 function changed(){const address=wallet();if(address===current)return;current=address;void reload();}
 refresh.onclick=()=>void reload();doc.addEventListener?.('jamd-wallet-portfolio',changed);changed();panel.hidden=!wallet();
 return {refresh:reload,dispose(){disposed=true;generation++;closeShare?.();doc.removeEventListener?.('jamd-wallet-portfolio',changed);panel.remove?.();}};
}
