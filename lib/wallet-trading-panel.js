import {currentWalletTradingState} from './wallet-trading-state.js';
import {setupWebClosePanel} from './perps-web-close-panel.js';
export function setupWalletTradingPanel(parent,language,doc){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const card=node('section');card.className='card wallet-trading-state';card.style.overflowWrap='anywhere';const title=node('h2',t('Cuenta y operaciones','Account and activity'));
 const status=node('p'),summary=node('p'),positions=node('details'),orders=node('details'),history=node('details');status.setAttribute('role','status');
 const refresh=node('button',t('Actualizar cuenta','Refresh account'));refresh.type='button';refresh.onclick=()=>{const Type=doc.defaultView?.Event||globalThis.Event;doc.dispatchEvent?.(new Type('jamd-wallet-refresh'));};
 card.append(title,status,summary,refresh,positions,orders,history);parent.append(card);
 const closes=!doc.defaultView?.Capacitor?.isNativePlatform?.()?setupWebClosePanel(card,{doc,language}):null;
 const amount=units=>(Number(BigInt(units))/1e6).toLocaleString(language,{maximumFractionDigits:6});
 function list(target,label,values,empty){target.replaceChildren(node('summary',label));for(const value of values)target.append(node('p',value));if(!values.length)target.append(node('p',empty));}
 function render(){
  const state=currentWalletTradingState(doc),snapshot=state?.snapshot;
  status.textContent=!state?t('Selecciona una billetera para consultar tu cuenta.','Select a wallet to inspect your account.'):
   !snapshot?t('Datos no disponibles o caducados; no se asume saldo cero.','Data unavailable or stale; zero funds are not assumed.'):
   t('Cuenta seleccionada: ','Selected account: ')+state.account.name+' · '+state.account.address.slice(0,4)+'…'+state.account.address.slice(-4)+' · '+new Date(snapshot.observedAt).toLocaleTimeString(language);
  summary.textContent=snapshot?t('En billetera: ','In wallet: ')+amount(snapshot.availableUsdcUnits)+' USDC · '+t('Margen en posiciones (USD): ','Position collateral (USD): ')+amount(snapshot.allocatedUsdUnits)+' · '+
   t('Disponible para dimensionar: ','Available for sizing: ')+(state.availableUsdcUnits===null?'—':amount(state.availableUsdcUnits)+' USDC')+' · '+
   (state.reservationsKnown?t('Sin reservas locales pendientes.','No pending local reservations.'):t('Reservas pendientes o sin verificar; no repetir operaciones.','Pending or unverified reservations; do not repeat operations.')):'';
  list(positions,t('Posiciones','Positions')+(snapshot?' ('+snapshot.positions.length+')':''),snapshot?snapshot.positions.map(p=>p.asset+' '+p.side+' · '+t('Tamaño USD: ','USD size: ')+amount(p.sizeUsdUnits)+' · '+t('Margen USD: ','USD collateral: ')+amount(p.collateralUsdUnits)):[],snapshot?t('Sin posiciones abiertas en Jupiter para esta cuenta.','No open Jupiter positions for this account.'):t('Sin verificar','Not verified'));
  list(orders,t('Órdenes y pendientes','Orders and pending operations'),[...(snapshot?snapshot.orders.map(o=>o.kind+' · '+o.address):[]),...(state?.operations||[]).map(o=>o.state+' · '+o.id)],snapshot?.ordersComplete&&state?.pendingKnown?t('Sin órdenes observadas ni operaciones locales pendientes.','No observed orders or pending local operations.'):t('Órdenes no verificadas completamente.','Orders not fully verified.'));
  list(history,t('Actividad reciente de Solana','Recent Solana activity'),snapshot?snapshot.history.map(h=>(h.failed?t('Fallida','Failed'):h.confirmation)+' · '+h.signature):[],snapshot?.historyComplete?t('Sin actividad reciente observada.','No recent activity observed.'):t('Historial no disponible o incompleto.','History unavailable or incomplete.'));
  if(snapshot&&!snapshot.historyComplete)history.append(node('small',t('Solo actividad reciente; el historial puede estar incompleto.','Recent activity only; history may be incomplete.')));
  if(snapshot&&!snapshot.ordersComplete)orders.append(node('small',t('La consulta de órdenes no está completa.','The order query is incomplete.')));
 }
 doc.addEventListener?.('jamd-trading-state',render);doc.addEventListener?.('jamd-wallet-portfolio',render);const timer=setInterval(render,5000);timer?.unref?.();render();
 return()=>{closes?.dispose();clearInterval(timer);doc.removeEventListener?.('jamd-trading-state',render);doc.removeEventListener?.('jamd-wallet-portfolio',render);card.remove();};
}
