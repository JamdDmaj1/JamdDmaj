import {MARKETS_CATALOG} from './markets-catalog.js';
import {setupCandleChart} from './finance-candles.js?v=20261113c';

export function filterMarkets(query, offset=0, favorites=null) {
  const q=String(query||'').trim().toLowerCase();
  const list=MARKETS_CATALOG.filter(a=>(favorites===null||favorites.includes(a.id))&&`${a.symbol} ${a.id}`.toLowerCase().includes(q));
  return {total:list.length,items:list.slice(offset,offset+20)};
}
export function chartPoints(candles) {
  const values=candles.filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.close)&&c.close>0)
    .sort((a,b)=>a.time-b.time).slice(-120).map(c=>c.close);
  if(values.length<2)return '';
  const low=Math.min(...values),span=Math.max(...values)-low||1;
  return values.map((v,i)=>`${(i/(values.length-1)*600).toFixed(2)},${(180-(v-low)/span*160).toFixed(2)}`).join(' ');
}
export function marketPeriodSummary(candles){
 const valid=candles.filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.close)&&c.close>0).sort((a,b)=>a.time-b.time);
 if(valid.length<2)return null;
 return {close:valid.at(-1).close,changePercent:(valid.at(-1).close/valid[0].close-1)*100,time:valid.at(-1).time};
}
// One shared market view moves between Home and Markets: no duplicated fetches or balances.
// Pure signal arithmetic over public candles; it never sends an order.
export function computeTradeSignal(rows){
 const candles=(Array.isArray(rows)?rows:[]).filter(c=>['open','high','low','close'].every(k=>Number.isFinite(c[k])))
 if(candles.length<55)return {action:'WAIT',reasons:['Datos insuficientes'],ema20:null,ema50:null,rsi:null};
 const ema=(period)=>{const k=2/(period+1);let value=null;for(const c of candles)value=value===null?c.close:c.close*k+value*(1-k);return value;};
 const rsi=(period=14)=>{if(candles.length<period+1)return null;let gain=0,loss=0;for(let i=candles.length-period;i<candles.length;i++){const d=candles[i].close-candles[i-1].close;if(d>=0)gain+=d;else loss-=d;}if(loss===0)return 100;const rs=gain/loss;return 100-100/(1+rs);};
 const fast=ema(20),slow=ema(50),strength=rsi();
 const reasons=[];
 if(fast===null||slow===null)return {action:'WAIT',reasons:['Datos insuficientes'],ema20:fast,ema50:slow,rsi:strength};
 if(fast>slow)reasons.push('EMA20 por encima de EMA50');else if(fast<slow)reasons.push('EMA20 por debajo de EMA50');
 if(strength!==null){if(strength>=70)reasons.push('RSI en sobrecompra');else if(strength<=30)reasons.push('RSI en sobreventa');else reasons.push('RSI en zona neutral');}
 const action=fast>slow?'BUY':'SELL';
 const caution=strength!==null&&(strength>=70||strength<=30);
 return {action,reasons,ema20:fast,ema50:slow,rsi:strength,caution};
}
export function setupFinanceMarkets(parent,language,doc,onTrade,request=globalThis.fetch) {
  const t=(es,en)=>language==='es'?es:en;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=node('section');panel.className='card finance-markets';panel.id='finance-markets';
  const heading=node('h2',t('Mercados','Markets'));
  const search=node('input');search.type='search';search.placeholder=t('Buscar moneda o símbolo','Search coin or symbol');search.setAttribute('aria-label',search.placeholder);
  const toolbar=node('div');toolbar.className='terminal-shortcuts';
  let favorites=[];try{const saved=JSON.parse(doc.defaultView?.localStorage?.getItem('jamd-market-favorites')||'[]');if(Array.isArray(saved))favorites=MARKETS_CATALOG.filter(a=>saved.includes(a.id)).map(a=>a.id);}catch{}
  let favoritesOnly=false;
  const favoritesToggle=node('button',t('☆ Favoritos','☆ Favorites'));favoritesToggle.setAttribute('aria-pressed','false');
  const refresh=node('button',t('Actualizar','Refresh')),previous=node('button','‹'),next=node('button','›');
  previous.setAttribute('aria-label',t('Página anterior','Previous page'));next.setAttribute('aria-label',t('Página siguiente','Next page'));
  toolbar.append(favoritesToggle,refresh,previous,next);
 // Bubble view: size by market cap, volume or ranking, coloured by the 24h move.
 const bubbleBox=node('div');bubbleBox.className='market-bubbles';bubbleBox.hidden=true;
 const metricSelect=node('select');metricSelect.className='market-bubble-metric';
 for(const [value,label] of [['marketCap',t('Capitalizacion','Market cap')],['volume',t('Volumen','Volume')],['rank',t('Top','Top')]]){const option=node('option',label);option.value=value;metricSelect.append(option);}
 const bubbleToggle=node('button',t('Burbujas','Bubbles'));bubbleToggle.type='button';bubbleToggle.setAttribute('aria-pressed','false');
 toolbar.append(bubbleToggle,metricSelect);
  const status=node('p');status.setAttribute('role','status');
  const rows=node('div');rows.className='finance-market-list';panel.append(bubbleBox);
  const columns=node('div');columns.className='finance-market-columns';
  columns.append(node('span',t('Activo','Asset')),node('span',t('Precio USD','USD price')),node('span',t('Operar','Trade')));
  const detail=node('section');detail.hidden=true;detail.className='card finance-chart-detail';
  panel.append(heading,search,toolbar,status,columns,rows,detail);parent.append(panel);
  let offset=0,revision=0,chartRevision=0,timer,debounce,disposed=false;
  const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
  async function showChart(asset,timeframe='1h'){
    try{doc.defaultView?.localStorage?.setItem?.('jamd-last-chart-symbol',JSON.stringify({symbol:asset.symbol,coinId:asset.id||String(asset.symbol).toLowerCase()}));}catch{}
    const ticket=++chartRevision;detail.hidden=false;detail.replaceChildren(node('h3',asset.symbol+' / USDT'));
    const controls=node('div');controls.className='terminal-shortcuts';
    const favorite=node('button');const updateFavorite=()=>{const selected=favorites.includes(asset.id);favorite.textContent=(selected?'★ ':'☆ ')+t('Favorito','Favorite');favorite.setAttribute('aria-pressed',String(selected));};updateFavorite();
    favorite.onclick=()=>{favorites=favorites.includes(asset.id)?favorites.filter(id=>id!==asset.id):[...favorites,asset.id];try{doc.defaultView?.localStorage?.setItem('jamd-market-favorites',JSON.stringify(favorites));}catch{}updateFavorite();if(favoritesOnly){offset=0;load();}};controls.append(favorite);
    for(const interval of ['15m','1h','4h','1d']){const button=node('button',interval);button.setAttribute('aria-pressed',String(interval===timeframe));button.onclick=()=>showChart(asset,interval);controls.append(button);}
    const trade=node('button',t('Operar este par','Trade this pair'));trade.onclick=()=>onTrade(asset);controls.append(trade);detail.append(controls);
    const provenance=node('details');provenance.className='chart-provenance';provenance.append(node('summary',t('Fuente y actualización','Source and refresh')));
    const note=node('p',t('Cargando gráfico…','Loading chart…'));provenance.append(note);detail.append(provenance);
    try{
      let response=await request(base+'/api/market-asset?'+new URLSearchParams({symbol:asset.symbol,coinId:asset.id,timeframe}),{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok){await new Promise(resolve=>setTimeout(resolve,500));response=await request(base+'/api/market-asset?'+new URLSearchParams({symbol:asset.symbol,coinId:asset.id,timeframe}),{signal:AbortSignal.timeout(15000),cache:'no-store'});}
      if(!response.ok)throw Error('HTTP '+response.status);
      if(!response.ok)throw Error();const data=await response.json();
      if(disposed||ticket!==chartRevision)return;
      const points=chartPoints(Array.isArray(data.candles)?data.candles:[]);if(!points)throw Error();
      if(!setupCandleChart(detail,data.candles,language,doc,{symbol:asset.symbol}))throw Error();
      const valid=data.candles.filter(c=>Number.isFinite(c.close)&&c.close>0&&Number.isFinite(c.time)).sort((a,b)=>a.time-b.time);
      const period=marketPeriodSummary(valid);
      if(period){const summary=node('div');summary.className='market-price-summary';summary.append(node('strong',period.close.toLocaleString(language,{maximumSignificantDigits:8})+' USDT'),node('span',(period.changePercent>=0?'+':'')+period.changePercent.toFixed(2)+'%'),node('small',t('Último cierre · cambio del período mostrado, no 24 h ni precio de ejecución','Last close · displayed period change, not 24h or an execution price')));detail.insertBefore?.(summary,controls);}
      const signal=computeTradeSignal(valid);
      const card=node('div');card.className='market-signal';
      const label={BUY:t('COMPRAR','BUY'),SELL:t('VENDER','SELL'),WAIT:t('ESPERAR','WAIT')}[signal.action];
      card.append(node('strong',t('Señal: ','Signal: ')+label),node('span',signal.reasons.join(' · ')+(signal.rsi!==null?' · RSI '+signal.rsi.toFixed(1):'')));
      card.append(node('small',t('Modo aviso: calcula la señal, no envía órdenes.','Alert mode: computes the signal, it does not send orders.')));
      detail.append(card);
      const info=node('p',t('Último cierre: ','Last close: ')+valid.at(-1).close.toLocaleString(language)+' USDT · '+new Date(valid.at(-1).time).toLocaleString(language));detail.append(info);
      note.textContent=timeframe+' · '+t('Velas y volumen · futuros públicos de Bitget. Datos al cargar; pulsa el período para actualizar. No es un precio de ejecución.','Candles and volume · public Bitget futures. Snapshot on load; select the interval to refresh. Not an execution price.');
    }catch{if(ticket===chartRevision&&!disposed){provenance.open=true;note.textContent=t('Gráfico no disponible para este par. Prueba otra moneda.','Chart unavailable for this pair. Try another asset.')+(String(error?.message||'')?(' · '+String(error.message).slice(0,60)):'');}}
  }
   let overview=null,overviewAt=0;
 const bubbleValue=(info,metric)=>{if(!info)return 0;if(metric==='marketCap')return Number(info.marketCap)||0;if(metric==='volume')return Number(info.volume)||0;return info.rank?100000/Math.max(1,Number(info.rank)):0;};
 const paintBubbles=async()=>{
  const query=search.value.toLowerCase().trim();
  const list=MARKETS_CATALOG.filter(asset=>(asset.symbol+' '+asset.id).toLowerCase().includes(query)&&(!favoritesOnly||favorites.includes(asset.id)));
  bubbleBox.replaceChildren();
  if(!overview||Date.now()-overviewAt>120000){try{const response=await request(base+'/api/market-overview',{cache:'no-store'});if(response.ok){overview=await response.json();overviewAt=Date.now();}}catch{}}
  const markets=(overview&&overview.markets)||{};
  const metric=metricSelect.value||'marketCap';
  const rows=list.map(asset=>({asset,info:markets[asset.id]||null}))
   .sort((a,b)=>bubbleValue(b.info,metric)-bubbleValue(a.info,metric));
  const max=Math.max(1,...rows.map(row=>bubbleValue(row.info,metric)));
  for(const [index,row] of rows.slice(0,120).entries()){
   const value=bubbleValue(row.info,metric);
   const size=34+Math.sqrt(value/max)*120;
   const change=row.info&&Number.isFinite(row.info.change24h)?Number(row.info.change24h):null;
   const bubble=node('button');bubble.type='button';bubble.className='market-bubble';
   if(change!==null)bubble.classList.add(change>0?'up':change<0?'down':'flat');
   bubble.style.width=size+'px';bubble.style.height=size+'px';bubble.style.animationDelay=((index%9)*0.35).toFixed(2)+'s';
   bubble.setAttribute('aria-label',row.asset.symbol+' '+(change===null?'':(change>0?'+':'')+change.toFixed(2)+'%'));
   bubble.append(node('strong',row.asset.symbol),(change!==null?node('small',(change>0?'+':'')+change.toFixed(2)+'%'):node('small','—')));
   bubble.onclick=()=>{void showChart(row.asset);detail.scrollIntoView?.({behavior:'smooth',block:'start'});};
   bubbleBox.append(bubble);
  }
  startFloating();
 };
 let floatFrame=null;
 const stopFloating=()=>{if(floatFrame!==null){try{(doc.defaultView||globalThis).cancelAnimationFrame?.(floatFrame);}catch{}floatFrame=null;}};
 const startFloating=()=>{
  stopFloating();
  const reduced=doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const nodes=[...bubbleBox.children];
  if(reduced||!nodes.length)return;
  const W=bubbleBox.clientWidth||800,H=bubbleBox.clientHeight||540;
  const flying=nodes.map(element=>{const size=element.offsetWidth||60;const x=Math.random()*Math.max(1,W-size),y=Math.random()*Math.max(1,H-size);element.style.left=x+'px';element.style.top=y+'px';const state={element,size,x,y,vx:(Math.random()-0.5)*0.5,vy:(Math.random()-0.5)*0.5,paused:false};element.onmouseenter=()=>{state.paused=true;};element.onmouseleave=()=>{state.paused=false;};return state;});
  const step=()=>{for(const state of flying){if(state.paused)continue;state.x+=state.vx;state.y+=state.vy;if(state.x<0||state.x>W-state.size){state.vx*=-1;state.x=Math.max(0,Math.min(W-state.size,state.x));}if(state.y<0||state.y>H-state.size){state.vy*=-1;state.y=Math.max(0,Math.min(H-state.size,state.y));}state.element.style.left=state.x+'px';state.element.style.top=state.y+'px';}floatFrame=(doc.defaultView||globalThis).requestAnimationFrame(step);};
  floatFrame=(doc.defaultView||globalThis).requestAnimationFrame(step);
 };
 const setBubbleView=active=>{bubbleBox.hidden=!active;bubbleBox.classList.toggle('free',active);if(!active)stopFloating();rows.style.display=active?'none':'';columns.style.display=active?'none':'';bubbleToggle.setAttribute('aria-pressed',String(active));bubbleToggle.textContent=active?t('Lista','List'):t('Burbujas','Bubbles');if(active)void paintBubbles();};
 bubbleToggle.addEventListener('click',()=>{try{bubbleBox.textContent=t('Cargando burbujas...','Loading bubbles...');setBubbleView(bubbleBox.hidden);}catch(error){bubbleBox.hidden=false;rows.style.display='none';columns.style.display='none';bubbleBox.textContent=t('Error al abrir burbujas: ','Could not open bubbles: ')+String(error&&error.message||error);}});
 metricSelect.onchange=()=>{if(!bubbleBox.hidden)void paintBubbles();};
async function load(){
    clearTimeout(timer);const ticket=++revision;const result=filterMarkets(search.value,offset,favoritesOnly?favorites:null);
    previous.disabled=offset===0;next.disabled=offset+20>=result.total;refresh.disabled=true;
    rows.replaceChildren();status.textContent=t('Consultando precios…','Loading prices…');
    const cells=new Map();
    for(const asset of result.items){
      const row=node('div');row.className='finance-market-row';
      const title=node('button');title.onclick=()=>onTrade(asset);
      const avatar=node('span',asset.symbol.slice(0,2));avatar.className='market-avatar';avatar.setAttribute('aria-hidden','true');
      const identity=node('span');identity.className='market-identity';identity.append(node('strong',asset.symbol),node('small',asset.id.replaceAll('-',' ')));title.append(avatar,identity);
      const price=node('span','—');price.className='market-price';const trade=node('button',t('Operar','Trade'));trade.setAttribute('aria-label',t('Operar ','Trade ')+asset.symbol);trade.onclick=()=>onTrade(asset);
      row.append(title,price,trade);rows.append(row);cells.set(asset.id,price);
    }
    try{
      if(!result.items.length){status.textContent=favoritesOnly?t('Sin favoritos coincidentes. Abre un gráfico y pulsa ☆ Favorito.','No matching favorites. Open a chart and select ☆ Favorite.'):t('Sin resultados','No results');return;}
      const response=await request(base+'/api/token-prices?ids='+result.items.map(a=>a.id).join(','),{signal:AbortSignal.timeout(18000),cache:'no-store'});
      if(!response.ok)throw Error();const data=await response.json();if(disposed||ticket!==revision)return;
      let count=0;for(const [id,cell]of cells){const value=data[id]?.usd;if(typeof value==='number'&&Number.isFinite(value)&&value>0){cell.textContent=value.toLocaleString(language,{style:'currency',currency:'USD',maximumSignificantDigits:7});count++;}else cell.textContent=t('No disponible','Unavailable');}
      status.textContent=`${offset+1}–${offset+result.items.length} / ${result.total} · `+t('Precios disponibles: ','Available prices: ')+count+' · '+new Date().toLocaleTimeString(language);
    }catch{if(ticket===revision&&!disposed)status.textContent=t('No se pudieron consultar los precios. Reintentar con Actualizar.','Prices unavailable. Use Refresh to retry.');}
    finally{if(ticket===revision&&!disposed){refresh.disabled=false;schedule();}}
  }
  function schedule(){timer=setTimeout(()=>{if(!doc.hidden&&!panel.parentElement?.hidden)load();else schedule();},60000);timer?.unref?.();}
  refresh.onclick=load;previous.onclick=()=>{offset=Math.max(0,offset-20);load();};next.onclick=()=>{offset+=20;load();};
  favoritesToggle.onclick=()=>{favoritesOnly=!favoritesOnly;favoritesToggle.setAttribute('aria-pressed',String(favoritesOnly));offset=0;load();};
  search.addEventListener('input',()=>{++revision;clearTimeout(debounce);clearTimeout(timer);offset=0;debounce=setTimeout(load,250);});
  load();return {panel,detail,showChart,refresh:load,dispose(){disposed=true;++revision;++chartRevision;clearTimeout(timer);clearTimeout(debounce);}};
}
