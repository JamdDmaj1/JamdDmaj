import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {validClosedTradePerformance,formatTradeUnits,formatTradePercent} from './closed-trade-performance.js';
import {openTradeShareDialog} from './trade-share-dialog.js';
import {summarizeClosedTrades} from './closed-trade-history-summary.js';
const PAGE=8;
export function setupBotClosedHistoryPanel(parent,{doc,language='es',client}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const panel=node('section',null,'card bot-closed-history'),header=node('div',null,'bch-header'),heading=node('div');
 heading.append(node('span',t('TU HISTORIAL','YOUR JOURNAL'),'bch-eyebrow'),node('h3',t('Operaciones cerradas','Closed trades')));
 const refresh=node('button',t('Actualizar historial','Refresh history'),'bch-refresh'),status=node('p',null,'bch-status'),summary=node('div',null,'bch-summary'),list=node('div',null,'bch-list');
 refresh.type='button';status.setAttribute('role','status');header.append(heading,refresh);panel.append(header,summary,status,list);parent.append(panel);
 let disposed=false,generation=0,current=null,closeShare=null,shown=PAGE,lastItems=[];
 const wallet=()=>{const a=selectedWalletAccount(doc);return a?.source==='watch'?a.address:null;};
 const fmt=(v,signed=false)=>formatTradeUnits(v,{language,signedValue:signed,digits:signed&&BigInt(v)!==0n&&BigInt(v)>-10000n&&BigInt(v)<10000n?6:2});
 const performanceOf=item=>item.performance&&validClosedTradePerformance(item.performance,item.receivedUsdcUnits,item.state)?item.performance:null;
 function shareImage(item,sourceButton){
  closeShare?.();const address=wallet();if(!address)return;
  closeShare=openTradeShareDialog({doc,language,item,sourceButton,isCurrent:()=>!disposed&&wallet()===address,onClose:()=>{closeShare=null;},restoreFocus:()=>refresh.focus?.()});
 }
 function renderSummary(items){
  const s=summarizeClosedTrades(items);summary.replaceChildren();
  const stat=(label,value,tone)=>{const cell=node('div',null,'bch-stat');cell.append(node('span',label,'bch-stat-label'),node('strong',value,'bch-stat-value'+(tone?' '+tone:'')));return cell;};
  const tone=s.totalUsdcUnits===null?'neutral':s.totalUsdcUnits>0n?'positive':s.totalUsdcUnits<0n?'negative':'neutral';
  summary.append(stat(t('Operaciones','Trades'),String(s.count)),stat(t('Resultado total','Total result'),s.totalUsdcUnits===null?'—':fmt(s.totalUsdcUnits.toString(),true)+' USDC',tone),stat(t('Ganadoras / perdedoras','Wins / losses'),s.wins+' / '+s.losses));
  if(s.unavailable)summary.append(stat(t('Sin datos conciliados','Missing reconciled data'),String(s.unavailable),'neutral'));
 }
 function row(item){
  const p=performanceOf(item),result=p?BigInt(p.resultUsdcUnits):null,tone=result===null||result===0n?'neutral':result>0n?'positive':'negative';
  const article=node('article',null,'bch-row bch-'+tone),main=node('div',null,'bch-row-main'),name=node('div',null,'bch-row-name');
  name.append(node('span',item.asset.slice(0,1),'bch-coin'),node('strong',item.asset+' / USDC'),node('span',item.side,'bch-side bch-side-'+item.side.toLowerCase()));
  const figures=node('div',null,'bch-row-figures');
  figures.append(node('strong',p?fmt(p.resultUsdcUnits,true)+' USDC':'—','bch-row-result'),node('span',p?formatTradePercent(p.returnBps,language):'—','bch-percent'));
  main.append(name,node('span',new Date(item.closedAt).toLocaleString(language==='es'?'es':'en',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),'bch-row-date'),figures);
  main.append(node('span',item.state==='COMPLETED'?t('✓ Conciliado','✓ Reconciled'):t('Conciliación pendiente','Accounting pending'),'bch-state'));
  article.append(main);
  const details=node('details',null,'bch-details');details.append(node('summary',t('Desglose','Breakdown')));const grid=node('dl');
  for(const [label,value]of [[t('Margen aportado','Contributed margin'),p?fmt(p.basisUsdcUnits)+' USDC':'—'],[t('Comisión de apertura registrada','Recorded opening platform fee'),p?formatTradeUnits(p.openingPlatformFeeUsdcUnits,{digits:4,language})+' USDC':'—'],[t('Importe recibido al cerrar','Proceeds received at close'),item.receivedUsdcUnits===null?'—':formatTradeUnits(item.receivedUsdcUnits,{digits:6,language})+' USDC'],[t('Fecha de cierre','Closed at'),new Date(item.closedAt).toLocaleString(language==='es'?'es':'en')]]){grid.append(node('dt',label),node('dd',value));}
  details.append(grid,node('p',t('Recibir capital no es ganarlo. El resultado resta el margen registrado y la comisión de apertura; no incluye costes de red ni rentas en SOL.','Proceeds are not profit. Result subtracts recorded margin and opening platform fee; it excludes SOL network costs and account rent.'),'bch-help'));
  const footer=node('div',null,'bch-footer'),button=node('button',t('↗ Compartir resultado','↗ Share result'),'bch-primary'),link=node('a',t('Ver cierre en Solana','View close on Solana'),'bch-explorer');
  button.type='button';button.onclick=()=>shareImage(item,button);link.href='https://solscan.io/tx/'+encodeURIComponent(item.firstLegSignature);link.target='_blank';link.rel='noopener noreferrer';footer.append(button,link);details.append(footer);
  article.append(details);return article;
 }
 function renderList(){
  list.replaceChildren();const visible=lastItems.slice(0,shown);
  for(const item of visible)list.append(row(item));
  if(lastItems.length>shown){const more=node('button',t('Mostrar '+(lastItems.length-shown)+' más','Show '+(lastItems.length-shown)+' more'),'bch-more');more.type='button';more.onclick=()=>{shown+=PAGE;renderList();};list.append(more);}
 }
 async function reload(){
  const address=wallet(),ticket=++generation;closeShare?.();list.textContent='';summary.replaceChildren();panel.hidden=!address;if(!address||disposed)return;
  refresh.disabled=true;status.textContent=t('Consultando cierres verificados…','Reading verified closes…');shown=PAGE;lastItems=[];
  try{const data=await client.history(address);if(disposed||ticket!==generation||wallet()!==address)return;
   lastItems=Array.isArray(data.items)?data.items:[];renderSummary(lastItems);renderList();
   status.textContent=lastItems.length?(data.hasMore?t('Últimas 50 operaciones registradas.','Latest 50 recorded trades.'):lastItems.length+' '+t('operaciones cerradas registradas.','recorded closed trades.')):t('Todavía no hay cierres verificados registrados para esta billetera.','No verified closes recorded for this wallet yet.');
  }catch{if(!disposed&&ticket===generation)status.textContent=t('No se pudo consultar el historial. Actualizar no envía órdenes.','History unavailable. Refreshing does not send orders.');}
  finally{if(!disposed&&ticket===generation)refresh.disabled=false;}
 }
 function changed(){const address=wallet();if(address===current)return;current=address;void reload();}
 refresh.onclick=()=>void reload();doc.addEventListener?.('jamd-wallet-portfolio',changed);changed();panel.hidden=!wallet();
 return {refresh:reload,dispose(){disposed=true;generation++;closeShare?.();doc.removeEventListener?.('jamd-wallet-portfolio',changed);panel.remove?.();}};
}
