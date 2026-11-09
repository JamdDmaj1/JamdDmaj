import {currentWalletTradingState} from './wallet-trading-state.js';
import {setupWebClosePanel} from './perps-web-close-panel.js';
import {readPerpsMarketReference} from './perps-market-reference.js';
import {positionDisplayMetrics,displayUsdDecimal} from './position-display-metrics.js';
import {tradingEquityDisplay,captureOpenTradeShare} from './trading-equity-display.js';
import {formatTradeUnits} from './closed-trade-performance.js';
import {openTradeShareDialog} from './trade-share-dialog.js';
import {createPhoenixManualClient} from './phoenix-manual-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
export function setupWalletTradingPanel(parent,language,doc){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 // Phoenix lives in its own subaccounts, so its collateral is invisible to the
 // Jupiter snapshot. It is read separately and added to the same card.
 const win=doc.defaultView||globalThis;
 const phoenixClient=createPhoenixManualClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
 let phoenixView=null,phoenixLoading=false;
 async function loadPhoenix(address){
  if(!address||phoenixLoading||phoenixView?.wallet===address)return;
  phoenixLoading=true;
  try{const data=await phoenixClient.positions(address);
   const margin=data.items.reduce((sum,item)=>sum+BigInt(item.marginUsdcUnits??'0'),0n);
   phoenixView={wallet:address,margin,items:data.items};}
  catch{phoenixView={wallet:address,margin:0n,items:[]};}
  finally{phoenixLoading=false;if(!disposed)render();}
 }
 if(doc.head?.append&&!doc.getElementById?.('wallet-trading-panel-style')){const css=node('link');css.id='wallet-trading-panel-style';css.rel='stylesheet';css.href='wallet-trading-panel.css?v=1.38.27-equity';doc.head.append(css);}
 const card=node('section');card.className='card wallet-trading-state';const title=node('h2',t('Tu cuenta de trading','Your trading account'));
 const header=node('header'),heading=node('div'),status=node('p'),summary=node('div'),notice=node('p'),positions=node('details'),orders=node('details'),history=node('details');header.className='wt-header';heading.append(node('span',t('RESUMEN DE CUENTA','ACCOUNT OVERVIEW')),title,status);status.className='wt-account';status.setAttribute('role','status');summary.className='wt-metrics';notice.className='wt-notice';positions.className='wt-section wt-positions';orders.className=history.className='wt-section';
 const refresh=node('button',t('Actualizar cuenta','Refresh account'));refresh.type='button';refresh.onclick=()=>{const Type=doc.defaultView?.Event||globalThis.Event;doc.dispatchEvent?.(new Type('jamd-wallet-refresh'));};
 const equityNote=node('p');equityNote.className='wt-equity-note';
 refresh.className='wt-refresh';header.append(heading,refresh);card.append(header,summary,equityNote,notice,positions,orders,history);parent.append(card);
 const closes=!doc.defaultView?.Capacitor?.isNativePlatform?.()?setupWebClosePanel(card,{doc,language}):null;
 const amount=(units,places=6)=>(Number(BigInt(units))/1e6).toLocaleString(language,{minimumFractionDigits:places===2?2:0,maximumFractionDigits:places});
 const short=value=>value.length>22?value.slice(0,8)+'…'+value.slice(-8):value;
 function list(target,label,values,empty){target.replaceChildren(node('summary',label));for(const value of values){const row=node(typeof value==='string'?'p':'details');row.className='wt-activity';if(typeof value==='string')row.textContent=value;else row.append(node('summary',value.label),node('p',value.full));target.append(row);}if(!values.length){const row=node('p',empty);row.className='wt-empty';target.append(row);}}
 function metric(label,value,unit,hint){const box=node('div');box.className='wt-metric';const number=node('strong',value);if(unit)number.append(node('small',unit));box.append(node('span',label),number,node('small',hint));summary.append(box);return box;}
 let openedFor=null,disposed=false,closeShare=null;const quotes=new Map(),attempted=new Map(),fetching=new Set();
 function quotePrices(snapshot){if(!snapshot||doc.hidden||card.offsetParent===null)return;for(const asset of new Set(snapshot.positions.map(p=>p.asset))){
  if(fetching.has(asset)||Date.now()-(attempted.get(asset)||0)<5000)continue;
  attempted.set(asset,Date.now());fetching.add(asset);
  void readPerpsMarketReference(asset,{fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch}).then(price=>{
   const [whole,fraction='']=price.split('.');quotes.set(asset,{priceUsdUnits:(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString(),observedAt:Date.now()});
  }).catch(()=>quotes.delete(asset)).finally(()=>{fetching.delete(asset);if(!disposed)render();});
 }}
 function render(){
  const state=currentWalletTradingState(doc),snapshot=state?.snapshot;
  const watchAddress=state?.account?.source==='watch'?state.account.address:null;
  if(watchAddress)void loadPhoenix(watchAddress);
  const phoenixMargin=watchAddress&&phoenixView?.wallet===watchAddress?phoenixView.margin:0n;
  const canAddPhoenix=phoenixMargin>0n&&typeof snapshot?.allocatedUsdUnits==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(snapshot.allocatedUsdUnits);
  const view=canAddPhoenix?{...snapshot,allocatedUsdUnits:(BigInt(snapshot.allocatedUsdUnits)+phoenixMargin).toString()}:snapshot;
  card.setAttribute('data-wallet-source',state?.account?.source||'none');
  status.textContent=!state?t('Selecciona una billetera para consultar tu cuenta.','Select a wallet to inspect your account.'):
   !snapshot?t('Datos no disponibles o caducados; no se asume saldo cero.','Data unavailable or stale; zero funds are not assumed.'):
   t('Cuenta seleccionada: ','Selected account: ')+state.account.name+' · '+state.account.address.slice(0,4)+'…'+state.account.address.slice(-4)+' · '+new Date(snapshot.observedAt).toLocaleTimeString(language);
  summary.replaceChildren();
  const equity=tradingEquityDisplay(view,quotes),equityBox=metric(t('Total estimado de la cuenta','Estimated account equity'),equity?.equityUsdUnits!=null?formatTradeUnits(equity.equityUsdUnits,{language}):'—',equity?.equityUsdUnits!=null?t('USD aprox.','approx. USD'):'',equity?.equityUsdUnits!=null?t('USDC en billetera + margen + PnL abierto estimado. No es saldo libre.','Wallet USDC + collateral + estimated open PnL. Not free trading funds.'):t('Esperando datos y referencias recientes de todas las posiciones.','Waiting for fresh data and references for every position.'));equityBox.className+=' wt-equity';
  metric(t('USDC en billetera','Wallet USDC'),snapshot?amount(snapshot.availableUsdcUnits,2):'—',snapshot?'USDC':'',t('Saldo fuera de posiciones; no es el total','Funds outside positions; not total equity'));
  metric(t('Margen en posiciones','Position collateral'),view?amount(view.allocatedUsdUnits,2):'—',snapshot?'USD':'',t('Colateral observado en red','Collateral observed on chain'));
  const floating=equity?.unrealizedPnlUsdUnits,pnlBox=metric(t('PnL abierto estimado','Estimated open PnL'),floating!=null?formatTradeUnits(floating,{language,signedValue:true}):'—',floating!=null?'USD':'',t('Ganancia/pérdida de precio, no realizada','Unrealized price profit/loss'));if(floating!=null)pnlBox.className+=BigInt(floating)>0n?' wt-positive':BigInt(floating)<0n?' wt-negative':' wt-neutral';
  if(state?.availableUsdcUnits!=null)metric(t('Disponible para operar','Available to trade'),amount(state.availableUsdcUnits,2),'USDC',t('Según los controles de fondos disponibles','Based on available-funds controls'));
  equityNote.textContent=t('Total orientativo: USDC valorado a 1 USD; antes de comisiones, financiación y cierre. No incluye SOL, otros tokens ni fondos en tránsito. La capacidad de abrir una orden se verifica por separado.','Indicative total: USDC valued at 1 USD; before fees, funding and closing costs. Excludes SOL, other tokens and funds in transit. New-order capacity is checked separately.');
  notice.textContent=!snapshot?t('Sin datos recientes no se asume saldo cero. Actualiza la cuenta.','Without fresh data, zero funds are not assumed. Refresh the account.'):
   state.operations.length?t('Hay operaciones registradas: consulta su estado antes de repetir un envío.','Recorded operations exist: check their state before repeating a submission.'):
   state.account.source==='watch'?t('Vista de consulta. El servidor comprueba saldo y reservas al revisar cada orden del bot.','Read-only view. The server checks funds and reservations during each bot-wallet order review.'):
   state.reservationsKnown?t('Sin reservas locales pendientes. Cada operación requiere tu confirmación.','No pending local reservations. Each operation requires your confirmation.'):
   t('Reservas sin verificar: consulta los pendientes antes de enviar otra orden.','Unverified reservations: check pending operations before sending another order.');
  positions.replaceChildren(node('summary',t('Posiciones abiertas','Open positions')+(snapshot?' · '+snapshot.positions.length:'')));
 if(canAddPhoenix){try{
  const strip=node('article');strip.className='wt-position';
  const head=node('div');head.className='wt-position-top';
  head.append(node('strong','Phoenix · '+(phoenixView.items.length)+' '+t('posición','position')),node('span',t('Colateral ','Collateral ')+amount(phoenixMargin,2)+' USDC'));
  const list=node('small');list.textContent=phoenixView.items.map(item=>item.symbol+(item.state?' · '+item.state:'')).join(' · ');
  strip.append(head,list);positions.append(strip);
 }catch{}}
  if(snapshot?.positions.length){
   if(openedFor!==state.account.address){positions.open=true;openedFor=state.account.address;}
   for(const p of snapshot.positions){
    const item=node('article'),top=node('div'),identity=node('div'),badge=node('span',p.side),metrics=node('dl');item.className='wt-position';top.className='wt-position-top';identity.className='wt-position-name';badge.className='wt-side '+(p.side==='SHORT'?'wt-short':'wt-long');identity.append(node('strong',p.asset),badge);top.append(identity,node('small',t('Observada en Solana','Observed on Solana')));
    for(const [label,value]of [[t('Exposición','Exposure'),amount(p.sizeUsdUnits,2)+' USD'],[t('Margen','Collateral'),amount(p.collateralUsdUnits,2)+' USD']]){const group=node('div');group.append(node('dt',label),node('dd',value));metrics.append(group);}
    const quote=quotes.get(p.asset),m=positionDisplayMetrics(p,quote),profit=node('div');profit.className='wt-pnl';
    profit.append(node('span',t('Ganancia / pérdida de precio · estimada','Price profit / loss · estimated')));
    const pnlValue=m?BigInt(m.pnlUsdUnits):0n,pnlPlaces=pnlValue!==0n&&pnlValue<10000n&&pnlValue> -10000n?4:2;
    const pnl=node('strong',m?(pnlValue>0n?'+':'')+(Number(m.pnlUsdUnits)/1e6).toLocaleString(language,{minimumFractionDigits:2,maximumFractionDigits:pnlPlaces})+' USD':'—');
    if(m)pnl.className=BigInt(m.pnlUsdUnits)>0n?'positive':BigInt(m.pnlUsdUnits)<0n?'negative':'neutral';
    profit.append(pnl,node('small',m?(BigInt(m.roeBasisPoints)>0n?'+':'')+(Number(m.roeBasisPoints)/100).toLocaleString(language,{maximumFractionDigits:2})+t('% sobre el margen observado','% on observed collateral'):t('Esperando referencia reciente','Waiting for a fresh reference')));
    if(m){const leverage=node('span',(Number(m.leverageHundredths)/100).toLocaleString(language,{maximumFractionDigits:2})+'×');leverage.className='wt-leverage';leverage.title=t('Exposición dividida entre el margen observado','Exposure divided by observed collateral');identity.append(leverage);}
    for(const [label,value]of [[t('Precio de entrada','Entry price'),amount(p.priceUsdUnits,2)+' USD'],[t('Precio de referencia','Reference price'),m?amount(m.markPriceUsdUnits,2)+' USD':'—']]){const group=node('div');group.append(node('dt',label),node('dd',value));metrics.append(group);}
    const disclaimer=node('small',t('Estimación antes de comisiones, financiación y costes de cierre. No es el importe neto que recibirás.','Estimate before fees, funding and closing costs. Not the net settlement you will receive.'));disclaimer.className='wt-pnl-note';
    const precision=node('details');precision.className='wt-position-details';precision.append(node('summary',t('Ver valores exactos','Show exact values')),node('p',t('Exposición: ','Exposure: ')+amount(p.sizeUsdUnits)+' USD · '+t('Margen: ','Collateral: ')+amount(p.collateralUsdUnits)+' USD'),node('small',p.address));item.append(top,profit,metrics,disclaimer,precision);
    const actions=node('div'),share=node('button',t('↗ Compartir posición','↗ Share position'));actions.className='wt-position-actions';share.className='wt-share bch-primary';share.type='button';share.disabled=!m;share.title=m?t('Crear una imagen del PnL estimado no realizado','Create an unrealized estimated PnL image'):t('Esperando referencia reciente','Waiting for a fresh reference');
    share.onclick=()=>{
     const current=currentWalletTradingState(doc),account=current?.account,position=current?.snapshot?.positions.find(v=>v.address===p.address);if(account!==state.account||!position)return;
     const captured=captureOpenTradeShare(position,quotes.get(position.asset),current.snapshot.observedAt);if(!captured)return;
     const isCurrent=()=>{const value=currentWalletTradingState(doc),live=value?.snapshot?.positions.find(v=>v.address===p.address);return !disposed&&value?.account===account&&!!live&&Date.now()-captured.capturedAt>=0&&Date.now()-captured.capturedAt<=60000&&['asset','side','priceUsdUnits','sizeUsdUnits','collateralUsdUnits'].every(key=>live[key]===captured.position[key]);};
     closeShare?.();closeShare=openTradeShareDialog({doc,language,item:captured,sourceButton:share,isCurrent,onClose:()=>{closeShare=null;},restoreFocus:()=>refresh.focus?.()});
    };actions.append(share);
    if(state.account.source==='watch'){
     const manage=node('button',t('Gestionar / cerrar posición','Manage / close position'));manage.type='button';manage.className='wt-manage';
     manage.onclick=()=>{const current=currentWalletTradingState(doc),fresh=quotes.get(p.asset);if(current?.account.address!==state.account.address||!current.snapshot?.positions.some(v=>v.address===p.address))return;
      const EventType=doc.defaultView?.CustomEvent||globalThis.CustomEvent;
      if(EventType)doc.dispatchEvent(new EventType('jamd-manage-bot-position',{detail:{walletAddress:state.account.address,positionAddress:p.address,referencePrice:positionDisplayMetrics(p,fresh)?displayUsdDecimal(fresh.priceUsdUnits):null,observedAt:fresh?.observedAt??0}}));
     };actions.append(manage);
    }
    item.append(actions);positions.append(item);
   }
  }else positions.append(node('p',snapshot?t('No hay posiciones abiertas observadas en esta cuenta.','No open positions observed for this account.'):t('Posiciones sin verificar.','Positions not verified.')));
  list(orders,t('Órdenes y pendientes','Orders and pending operations'),[...(snapshot?snapshot.orders.map(o=>o.kind+' · '+o.address):[]),...(state?.operations||[]).map(o=>o.state+' · '+o.id)],snapshot?.ordersComplete&&state?.pendingKnown?t('Sin órdenes observadas ni operaciones locales pendientes.','No observed orders or pending local operations.'):t('Órdenes no verificadas completamente.','Orders not fully verified.'));
  list(history,t('Actividad reciente de Solana','Recent Solana activity'),snapshot?snapshot.history.map(h=>({label:(h.failed?t('Fallida','Failed'):h.confirmation)+' · '+short(h.signature),full:h.signature})):[],snapshot?.historyComplete?t('Sin actividad reciente observada.','No recent activity observed.'):t('Historial no disponible o incompleto.','History unavailable or incomplete.'));
  if(snapshot&&!snapshot.historyComplete)history.append(node('small',t('Solo actividad reciente; el historial puede estar incompleto.','Recent activity only; history may be incomplete.')));
  if(snapshot&&!snapshot.ordersComplete)orders.append(node('small',t('La consulta de órdenes no está completa.','The order query is incomplete.')));
  quotePrices(snapshot);
 }
 doc.addEventListener?.('jamd-trading-state',render);doc.addEventListener?.('jamd-wallet-portfolio',render);doc.addEventListener?.('visibilitychange',render);const timer=setInterval(render,5000);timer?.unref?.();render();
 return()=>{disposed=true;closeShare?.();closes?.dispose();clearInterval(timer);doc.removeEventListener?.('jamd-trading-state',render);doc.removeEventListener?.('jamd-wallet-portfolio',render);doc.removeEventListener?.('visibilitychange',render);card.remove();};
}
