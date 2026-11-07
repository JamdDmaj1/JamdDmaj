import {currentWalletTradingState} from './wallet-trading-state.js';
import {setupWebClosePanel} from './perps-web-close-panel.js';
export function setupWalletTradingPanel(parent,language,doc){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 if(doc.head?.append&&!doc.getElementById?.('wallet-trading-panel-style')){const css=node('link');css.id='wallet-trading-panel-style';css.rel='stylesheet';css.href='wallet-trading-panel.css?v=1.38.22';doc.head.append(css);}
 const card=node('section');card.className='card wallet-trading-state';const title=node('h2',t('Tu cuenta de trading','Your trading account'));
 const header=node('header'),heading=node('div'),status=node('p'),summary=node('div'),notice=node('p'),positions=node('details'),orders=node('details'),history=node('details');header.className='wt-header';heading.append(node('span',t('RESUMEN DE CUENTA','ACCOUNT OVERVIEW')),title,status);status.className='wt-account';status.setAttribute('role','status');summary.className='wt-metrics';notice.className='wt-notice';positions.className='wt-section wt-positions';orders.className=history.className='wt-section';
 const refresh=node('button',t('Actualizar cuenta','Refresh account'));refresh.type='button';refresh.onclick=()=>{const Type=doc.defaultView?.Event||globalThis.Event;doc.dispatchEvent?.(new Type('jamd-wallet-refresh'));};
 refresh.className='wt-refresh';header.append(heading,refresh);card.append(header,summary,notice,positions,orders,history);parent.append(card);
 const closes=!doc.defaultView?.Capacitor?.isNativePlatform?.()?setupWebClosePanel(card,{doc,language}):null;
 const amount=(units,places=6)=>(Number(BigInt(units))/1e6).toLocaleString(language,{minimumFractionDigits:places===2?2:0,maximumFractionDigits:places});
 const short=value=>value.length>22?value.slice(0,8)+'…'+value.slice(-8):value;
 function list(target,label,values,empty){target.replaceChildren(node('summary',label));for(const value of values){const row=node(typeof value==='string'?'p':'details');row.className='wt-activity';if(typeof value==='string')row.textContent=value;else row.append(node('summary',value.label),node('p',value.full));target.append(row);}if(!values.length){const row=node('p',empty);row.className='wt-empty';target.append(row);}}
 function metric(label,value,unit,hint){const box=node('div');box.className='wt-metric';const number=node('strong',value);if(unit)number.append(node('small',unit));box.append(node('span',label),number,node('small',hint));summary.append(box);}
 let openedFor=null;
 function render(){
  const state=currentWalletTradingState(doc),snapshot=state?.snapshot;
  card.setAttribute('data-wallet-source',state?.account?.source||'none');
  status.textContent=!state?t('Selecciona una billetera para consultar tu cuenta.','Select a wallet to inspect your account.'):
   !snapshot?t('Datos no disponibles o caducados; no se asume saldo cero.','Data unavailable or stale; zero funds are not assumed.'):
   t('Cuenta seleccionada: ','Selected account: ')+state.account.name+' · '+state.account.address.slice(0,4)+'…'+state.account.address.slice(-4)+' · '+new Date(snapshot.observedAt).toLocaleTimeString(language);
  summary.replaceChildren();
  metric(t('En billetera','In wallet'),snapshot?amount(snapshot.availableUsdcUnits,2):'—',snapshot?'USDC':'',snapshot?t('Saldo consultado','Observed balance'):t('Esperando datos verificados','Waiting for verified data'));
  metric(t('Margen en posiciones','Position collateral'),snapshot?amount(snapshot.allocatedUsdUnits,2):'—',snapshot?'USD':'',t('Colateral observado en red','Collateral observed on chain'));
  metric(t('Disponible para operar','Available to trade'),state?.availableUsdcUnits!=null?amount(state.availableUsdcUnits,2):'—',state?.availableUsdcUnits!=null?'USDC':'',state?.availableUsdcUnits!=null?t('Según los datos verificados','Based on verified data'):t('Se verifica al revisar la orden','Checked during order review'));
  notice.textContent=!snapshot?t('Sin datos recientes no se asume saldo cero. Actualiza la cuenta.','Without fresh data, zero funds are not assumed. Refresh the account.'):
   state.operations.length?t('Hay operaciones registradas: consulta su estado antes de repetir un envío.','Recorded operations exist: check their state before repeating a submission.'):
   state.account.source==='watch'?t('Vista de consulta. El servidor comprueba saldo y reservas al revisar cada orden del bot.','Read-only view. The server checks funds and reservations during each bot-wallet order review.'):
   state.reservationsKnown?t('Sin reservas locales pendientes. Cada operación requiere tu confirmación.','No pending local reservations. Each operation requires your confirmation.'):
   t('Reservas sin verificar: consulta los pendientes antes de enviar otra orden.','Unverified reservations: check pending operations before sending another order.');
  positions.replaceChildren(node('summary',t('Posiciones abiertas','Open positions')+(snapshot?' · '+snapshot.positions.length:'')));
  if(snapshot?.positions.length){
   if(openedFor!==state.account.address){positions.open=true;openedFor=state.account.address;}
   for(const p of snapshot.positions){
    const item=node('article'),top=node('div'),identity=node('div'),badge=node('span',p.side),metrics=node('dl');item.className='wt-position';top.className='wt-position-top';identity.className='wt-position-name';badge.className='wt-side '+(p.side==='SHORT'?'wt-short':'wt-long');identity.append(node('strong',p.asset),badge);top.append(identity,node('small',t('Observada en Solana','Observed on Solana')));
    for(const [label,value]of [[t('Exposición','Exposure'),amount(p.sizeUsdUnits,2)+' USD'],[t('Margen','Collateral'),amount(p.collateralUsdUnits,2)+' USD']]){const group=node('div');group.append(node('dt',label),node('dd',value));metrics.append(group);}
    const precision=node('details');precision.className='wt-position-details';precision.append(node('summary',t('Ver valores exactos','Show exact values')),node('p',t('Exposición: ','Exposure: ')+amount(p.sizeUsdUnits)+' USD · '+t('Margen: ','Collateral: ')+amount(p.collateralUsdUnits)+' USD'),node('small',p.address));item.append(top,metrics,precision);positions.append(item);
   }
  }else positions.append(node('p',snapshot?t('No hay posiciones abiertas observadas en esta cuenta.','No open positions observed for this account.'):t('Posiciones sin verificar.','Positions not verified.')));
  list(orders,t('Órdenes y pendientes','Orders and pending operations'),[...(snapshot?snapshot.orders.map(o=>o.kind+' · '+o.address):[]),...(state?.operations||[]).map(o=>o.state+' · '+o.id)],snapshot?.ordersComplete&&state?.pendingKnown?t('Sin órdenes observadas ni operaciones locales pendientes.','No observed orders or pending local operations.'):t('Órdenes no verificadas completamente.','Orders not fully verified.'));
  list(history,t('Actividad reciente de Solana','Recent Solana activity'),snapshot?snapshot.history.map(h=>({label:(h.failed?t('Fallida','Failed'):h.confirmation)+' · '+short(h.signature),full:h.signature})):[],snapshot?.historyComplete?t('Sin actividad reciente observada.','No recent activity observed.'):t('Historial no disponible o incompleto.','History unavailable or incomplete.'));
  if(snapshot&&!snapshot.historyComplete)history.append(node('small',t('Solo actividad reciente; el historial puede estar incompleto.','Recent activity only; history may be incomplete.')));
  if(snapshot&&!snapshot.ordersComplete)orders.append(node('small',t('La consulta de órdenes no está completa.','The order query is incomplete.')));
 }
 doc.addEventListener?.('jamd-trading-state',render);doc.addEventListener?.('jamd-wallet-portfolio',render);const timer=setInterval(render,5000);timer?.unref?.();render();
 return()=>{closes?.dispose();clearInterval(timer);doc.removeEventListener?.('jamd-trading-state',render);doc.removeEventListener?.('jamd-wallet-portfolio',render);card.remove();};
}
