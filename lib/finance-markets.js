import {MARKETS_CATALOG} from './markets-catalog.js';

export function filterMarkets(query, offset=0) {
  const q=String(query||'').trim().toLowerCase();
  const list=MARKETS_CATALOG.filter(a=>`${a.symbol} ${a.id}`.toLowerCase().includes(q));
  return {total:list.length,items:list.slice(offset,offset+20)};
}
export function chartPoints(candles) {
  const values=candles.filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.close)&&c.close>0)
    .sort((a,b)=>a.time-b.time).slice(-120).map(c=>c.close);
  if(values.length<2)return '';
  const low=Math.min(...values),span=Math.max(...values)-low||1;
  return values.map((v,i)=>`${(i/(values.length-1)*600).toFixed(2)},${(180-(v-low)/span*160).toFixed(2)}`).join(' ');
}
// One shared market view moves between Home and Markets: no duplicated fetches or balances.
export function setupFinanceMarkets(parent,language,doc,onTrade,request=globalThis.fetch) {
  const t=(es,en)=>language==='es'?es:en;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=node('section');panel.className='card finance-markets';panel.id='finance-markets';
  const heading=node('h2',t('Mercados','Markets'));
  const search=node('input');search.type='search';search.placeholder=t('Buscar moneda o símbolo','Search coin or symbol');search.setAttribute('aria-label',search.placeholder);
  const toolbar=node('div');toolbar.className='terminal-shortcuts';
  const refresh=node('button',t('Actualizar','Refresh')),previous=node('button','‹'),next=node('button','›');
  previous.setAttribute('aria-label',t('Página anterior','Previous page'));next.setAttribute('aria-label',t('Página siguiente','Next page'));
  toolbar.append(refresh,previous,next);
  const status=node('p');status.setAttribute('role','status');
  const rows=node('div');rows.className='finance-market-list';
  const detail=node('section');detail.hidden=true;detail.className='card';
  panel.append(heading,search,toolbar,status,rows,detail);parent.append(panel);
  let offset=0,revision=0,chartRevision=0,timer,debounce,disposed=false;
  const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
  async function showChart(asset){
    const ticket=++chartRevision;detail.hidden=false;detail.replaceChildren(node('h3',asset.symbol+' / USDT'));
    const note=node('p',t('Cargando gráfico…','Loading chart…'));detail.append(note);
    try{
      const response=await request(base+'/api/market-asset?'+new URLSearchParams({symbol:asset.symbol,coinId:asset.id,timeframe:'1h'}),{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok)throw Error();const data=await response.json();
      if(disposed||ticket!==chartRevision)return;
      const points=chartPoints(Array.isArray(data.candles)?data.candles:[]);if(!points)throw Error();
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 200');svg.setAttribute('role','img');svg.setAttribute('aria-label',asset.symbol+' · 1h');
      const line=doc.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',points);line.setAttribute('fill','none');line.setAttribute('stroke','#65e4cf');line.setAttribute('stroke-width','3');svg.append(line);detail.append(svg);
      note.textContent=t('Cierres de velas de 1 hora · futuros públicos de Bitget. No es un precio de ejecución.','Hourly candle closes · public Bitget futures. Not an execution price.');
    }catch{if(ticket===chartRevision&&!disposed)note.textContent=t('Gráfico no disponible para este par. Prueba otra moneda.','Chart unavailable for this pair. Try another asset.');}
  }
  async function load(){
    clearTimeout(timer);const ticket=++revision;const result=filterMarkets(search.value,offset);
    previous.disabled=offset===0;next.disabled=offset+20>=result.total;refresh.disabled=true;
    rows.replaceChildren();status.textContent=t('Consultando precios…','Loading prices…');
    const cells=new Map();
    for(const asset of result.items){
      const row=node('div');row.className='finance-market-row';
      const title=node('button',asset.symbol+' · '+asset.id.replaceAll('-',' '));title.onclick=()=>{panel.append(detail);showChart(asset);};
      const price=node('span','—');const trade=node('button','Trade');trade.onclick=()=>onTrade(asset);
      row.append(title,price,trade);rows.append(row);cells.set(asset.id,price);
    }
    try{
      if(!result.items.length){status.textContent=t('Sin resultados','No results');return;}
      const response=await request(base+'/api/token-prices?ids='+result.items.map(a=>a.id).join(','),{signal:AbortSignal.timeout(18000),cache:'no-store'});
      if(!response.ok)throw Error();const data=await response.json();if(disposed||ticket!==revision)return;
      let count=0;for(const [id,cell]of cells){const value=data[id]?.usd;if(typeof value==='number'&&Number.isFinite(value)&&value>0){cell.textContent=value.toLocaleString(language,{style:'currency',currency:'USD',maximumSignificantDigits:7});count++;}else cell.textContent=t('No disponible','Unavailable');}
      status.textContent=`${offset+1}–${offset+result.items.length} / ${result.total} · `+t('Precios disponibles: ','Available prices: ')+count+' · '+new Date().toLocaleTimeString(language);
    }catch{if(ticket===revision&&!disposed)status.textContent=t('No se pudieron consultar los precios. Reintentar con Actualizar.','Prices unavailable. Use Refresh to retry.');}
    finally{if(ticket===revision&&!disposed){refresh.disabled=false;schedule();}}
  }
  function schedule(){timer=setTimeout(()=>{if(!doc.hidden&&!panel.parentElement?.hidden)load();else schedule();},60000);timer?.unref?.();}
  refresh.onclick=load;previous.onclick=()=>{offset=Math.max(0,offset-20);load();};next.onclick=()=>{offset+=20;load();};
  search.addEventListener('input',()=>{++revision;clearTimeout(debounce);clearTimeout(timer);offset=0;debounce=setTimeout(load,250);});
  load();return {panel,detail,showChart,refresh:load,dispose(){disposed=true;++revision;++chartRevision;clearTimeout(timer);clearTimeout(debounce);}};
}
