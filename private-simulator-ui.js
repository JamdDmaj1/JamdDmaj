import {language,tr,localize} from './lib/simulator-i18n.js?v=10';
import {pnl,indicators} from './lib/private-simulator.js?v=5';
import {SimulatorAccount} from './lib/simulator-account.js?v=5';
let account=new SimulatorAccount();
const canonical={btc:['bitcoin','Bitcoin','BTC'],bitcoin:['bitcoin','Bitcoin','BTC'],eth:['ethereum','Ethereum','ETH'],ethereum:['ethereum','Ethereum','ETH'],sol:['solana','Solana','SOL'],solana:['solana','Solana','SOL'],zec:['zcash','Zcash','ZEC'],zcash:['zcash','Zcash','ZEC']};
async function catalogPrices(ids,signal=AbortSignal.timeout(10000)){const r=await fetch('/api/token-prices?ids='+encodeURIComponent(ids.join(',')),{signal});if(!r.ok)throw new Error('prices');return r.json();}
async function referencePrice(id){const d=await catalogPrices([id]),v=Number(d[id]?.usd);if(!Number.isFinite(v)||v<=0)throw new Error('reference');return v;}

let initialQuotePending=true;let symbol='builtin:BTC'; const markets=new Map();
const $=id=>document.getElementById(id), money=n=>n.toLocaleString(language,{style:'currency',currency:'USD'}), quote=n=>n.toLocaleString(language,{maximumSignificantDigits:8});
let price=60000,position=null,paused=false,asset='Bitcoin · BTC',ticks=[],clock=0,view=70,offset=0,mouse=null,drag=null,searchVersion=0;
function seed(initial){price=initial;ticks=[];clock=0;let v=initial;for(let i=0;i<600;i++){v*=1+(Math.random()-.5)*.001;ticks.push({t:clock++,v});}const scale=initial/v;ticks.forEach(t=>t.v*=scale);view=70;offset=0;}
function bars(){
 const size=Number($('timeframe').value),market=markets.get(symbol);
 if(market.live){const rows=[];for(const sample of [...(market.history||[]),...market.samples].sort((a,b)=>a.time-b.time)){const t=Math.floor(sample.time/1000/size);let b=rows.at(-1);if(!b||b.t!==t){b={t,open:sample.price,close:sample.price,high:sample.price,low:sample.price};rows.push(b);}b.close=sample.price;b.high=Math.max(b.high,sample.price);b.low=Math.min(b.low,sample.price);}return rows;}
 if(initialQuotePending)return [];
 if(!market.charts)market.charts={};
 if(!market.charts[size]){
  let v=price,rows=[],now=Math.floor(Date.now()/1000/size);
  for(let i=0;i<120;i++){const open=v;v*=1+(Math.random()-.5)*.012;rows.push({t:now-119+i,open,close:v,high:Math.max(open,v)*1.002,low:Math.min(open,v)*.998});}
  const scale=price/v;rows.forEach(b=>{for(const key of ['open','close','high','low'])b[key]*=scale;});market.charts[size]=rows;
 }
 const rows=market.charts[size],t=Math.floor(Date.now()/1000/size);let b=rows.at(-1);
 if(t>b.t){b={t,open:b.close,close:price,high:Math.max(b.close,price),low:Math.min(b.close,price)};rows.push(b);if(rows.length>500)rows.shift();}
 b.close=price;b.high=Math.max(b.high,price);b.low=Math.min(b.low,price);return rows;
}
function draw(){const all=bars(),data=indicators(all.map(b=>b.close));offset=Math.min(offset,Math.max(0,all.length-10));const end=all.length-offset,start=Math.max(0,end-view),rows=all.slice(start,end),values=data.slice(start,end);const canvas=$('chart'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,right=w-150;
 c.clearRect(0,0,w,h);if(!rows.length)return;let low=Math.min(...rows.map(b=>b.low)),high=Math.max(...rows.map(b=>b.high));if($('bb').checked){low=Math.min(low,...values.map(v=>v.lower??low));high=Math.max(high,...values.map(v=>v.upper??high));}const pad=Math.max((high-low)*.15,price*.0001);low-=pad;high+=pad;const y=v=>h-25-(v-low)/(high-low)*(h-50),step=right/rows.length;
 c.font='16px system-ui';for(let i=0;i<6;i++){const v=low+(high-low)*i/5,yy=y(v);c.strokeStyle='#26354b';c.beginPath();c.moveTo(0,yy);c.lineTo(right,yy);c.stroke();c.fillStyle='#9badc5';c.fillText(quote(v),right+8,yy+4);}
 rows.forEach((b,i)=>{const x=(i+.5)*step;c.strokeStyle=c.fillStyle=b.close>=b.open?'#40d6a0':'#ff657f';c.beginPath();c.moveTo(x,y(b.high));c.lineTo(x,y(b.low));c.stroke();c.fillRect(x-step*.3,Math.min(y(b.open),y(b.close)),Math.max(1,step*.6),Math.max(1,Math.abs(y(b.close)-y(b.open))));});
 function line(key,color){c.strokeStyle=color;c.beginPath();let begun=false;values.forEach((v,i)=>{if(v[key]===null)return;const x=(i+.5)*step;begun?c.lineTo(x,y(v[key])):c.moveTo(x,y(v[key]));begun=true;});c.stroke();}
 if($('sma').checked)line('sma','#f5bd57');if($('ema').checked)line('ema','#68adff');if($('bb').checked){line('upper','#b79cf8');line('lower','#b79cf8');}
 for(const [v,label,color] of [[price,'Último','#9badc5'],[position?.entry,'Entrada','#68adff'],[position?account.liquidation(position):null,'Liq.','#ff657f']])if(v&&v>=low&&v<=high){c.setLineDash([4,4]);c.strokeStyle=color;c.beginPath();c.moveTo(0,y(v));c.lineTo(right,y(v));c.stroke();c.setLineDash([]);c.fillStyle=color;c.fillText(label,right+8,y(v)-9);}
 if(mouse){const i=Math.max(0,Math.min(rows.length-1,Math.floor(mouse.x/step))),b=rows[i];c.strokeStyle='#768ca9';c.beginPath();c.moveTo((i+.5)*step,0);c.lineTo((i+.5)*step,h);c.stroke();$('crosshair').textContent=`Vela ${new Date(b.t*Number($('timeframe').value)*1000).toLocaleString()} · O ${quote(b.open)} H ${quote(b.high)} L ${quote(b.low)} C ${quote(b.close)}`;}
 const r=$('rsiChart'),rc=r.getContext('2d');r.hidden=!$('rsi').checked;rc.clearRect(0,0,w,90);rc.font='12px system-ui';rc.fillStyle='#b79cf8';rc.fillText('RSI14 '+(values.at(-1)?.rsi?.toFixed(1)??'—'),right+8,20);for(const n of [30,70]){rc.strokeStyle='#35445c';rc.beginPath();rc.moveTo(0,85-n*.8);rc.lineTo(right,85-n*.8);rc.stroke();}rc.strokeStyle='#b79cf8';rc.beginPath();let begun=false;values.forEach((v,i)=>{if(v.rsi===null)return;const x=(i+.5)*step,yy=85-v.rsi*.8;begun?rc.lineTo(x,yy):rc.moveTo(x,yy);begun=true;});rc.stroke();
}
function args(side){return {side,margin:Number($('margin').value),leverage:Number($('leverage').value),mode:$('mode').value,price,symbol,name:asset,type:$('orderType').value,limit:Number($('limitPrice').value),stop:$('stop').value===''?null:Number($('stop').value),take:$('take').value===''?null:Number($('take').value)};}
function record(rows){for(const r of rows.filter(Boolean)){const li=document.createElement('li');li.className=r.result>=0?'positive':'negative';li.textContent=`${r.name||asset} · ${r.side} ${r.mode} ${r.leverage}× · ${r.reason} · ${money(r.result)}`;$('history').prepend(li);}}
function render(){
 position=account.positions.find(p=>p.symbol===symbol)||null;
 const result=account.profit();
 const current=markets.get(symbol);$('chartStatus').textContent=current.historyLoading?(language==='es'?'Cargando historial público…':'Loading public history…'):(current.historyStatus|| (current.live?(language==='es'?'Recopilando muestras reales. Los indicadores necesitan más velas.':'Collecting real samples. Indicators need more candles.'):(language==='es'?'Escenario manual ficticio':'Synthetic manual scenario')));$('up').disabled=$('down').disabled=$('pause').disabled=!!current.live;
 $('identity').textContent=current.live?`${current.identity} · ${current.live.coin?'CoinGecko · USD reference':'DEX Screener'} · ${language==='es'?'consultado':'fetched'} ${new Date(current.updated).toLocaleTimeString(language)} · ${current.error||Date.now()-current.updated>45000?(language==='es'?'ATRASADO / órdenes bloqueadas':'STALE / orders blocked'):(language==='es'?'precio público · consulta cada 15 s':'public quote · 15 s polling')} · ${language==='es'?'velas de muestras recibidas, no historial completo':'sampled candles, not full history'}`:current.identity+' · '+tr('movimientos sintéticos');
 $('balance').textContent=money(account.available());$('equity').textContent=money(account.equity());$('quote').textContent=initialQuotePending?'—':quote(price)+' USD';
 $('profit').textContent=account.positions.length?money(result):'—';$('profit').className=result>0?'positive':result<0?'negative':'neutral';$('assetName').textContent=asset;
 $('mode').disabled=!!(account.positions.length||account.orders.length);
 $('long').disabled=!fresh();$('short').disabled=!fresh();$('close').disabled=!account.positions.length;
 $('position').replaceChildren();
 for(const p of account.positions){
  const div=document.createElement('div'),text=document.createElement('p'),button=document.createElement('button'),liq=account.liquidation(p),profit=pnl(p,account.price(p));
  text.className=profit>0?'positive':profit<0?'negative':'neutral';
  text.textContent=`#${p.id} ${p.name} · ${p.side.toUpperCase()} · ${p.mode} · ${p.leverage}×\nMargen: ${money(p.margin)} · tamaño: ${money(p.margin*p.leverage)}\nEntrada: ${quote(p.entry)} USD\nP/L: ${money(profit)}\nLiquidación ${p.mode==='cross'?'compartida':'estimada'}: ${liq?quote(liq)+' USD':'sin umbral positivo en este modelo'}`;
  button.textContent='Cerrar '+p.side.toUpperCase();button.onclick=()=>{if(!fresh()){$('error').textContent=language==='es'?'Cotización atrasada; cierre bloqueado.':'Stale quote; close blocked.';return;}record([account.close(p.id)]);record(account.tick());render();};
  div.append(text,button);$('position').append(div);
 }
 if(!account.positions.length)$('position').textContent='Sin posiciones abiertas.';
 const near=account.positions.some(p=>{const l=account.liquidation(p);return l&&Math.abs(account.price(p)-l)/account.price(p)<.02;});
 $('risk').textContent=((position?.mode||$('mode').value)==='cross'?'Cross: saldo y P/L compartidos entre ambas posiciones. ':'Isolated: cada posición arriesga solo su margen; el saldo libre no la rescata. ')+(near?'⚠ Liquidación a menos del 2%. ':'')+(account.positions.length>=2?'Cobertura activa: revisa el P/L neto. Cerrar una pierna elimina su protección.':'');
 const margin=Number($('margin').value),lev=Number($('leverage').value);
 $('preview').textContent=Number.isFinite(margin*lev)&&margin>0&&lev>=1?`Tamaño: ${money(margin*lev)} · margen: ${money(margin)}`:'';
 $('leverageRange').value=$('leverage').value;$('leverageValue').textContent=$('leverage').value+'×';
 $('marginValue').textContent=money(margin);
 const available=account.available();$('marginRange').value=available?Math.min(100,margin/available*100):0;
 $('pending').replaceChildren();
 for(const o of account.orders){const row=document.createElement('p'),button=document.createElement('button');row.textContent=`#${o.id} ${o.name} · ${o.side} Limit ${quote(o.limit)} USD · margen ${money(o.margin)} `;button.textContent='Cancelar';button.onclick=()=>{account.cancel(o.id);render();};row.append(button);$('pending').append(row);}
 $('limitLabel').hidden=$('limitPrice').hidden=$('orderType').value!=='limit';
 draw();localize();
}
function move(factor){const market=markets.get(symbol);if(market.live)return;market.price*=factor;price=market.price;account.mark(symbol,price);record(account.tick());render();}
function select(name,identity,initial,live=null){
 if(!Number.isFinite(initial)||initial<=0)throw new Error('Introduce un precio inicial mayor que cero.');
 const key=identity||'manual:'+name;
 if(!markets.has(key))markets.set(key,{name:String(name).slice(0,100),identity,price:initial,charts:{},live,updated:live?Date.now():0,samples:live?[{time:Date.now(),price:initial}]:[]});
 initialQuotePending=false;symbol=key;const market=markets.get(key);asset=market.name;price=market.price;account.mark(symbol,price);
 $('identity').textContent=market.identity+' · movimientos sintéticos';offset=0;
 $('stop').value='';$('take').value='';$('limitPrice').value=price;$('results').replaceChildren();$('searchStatus').textContent='';
 render();
}
for(const side of ['long','short'])$(side).onclick=()=>{try{if(!fresh())throw new Error(language==='es'?'Cotización atrasada: espera la actualización.':'Stale quote: wait for an update.');account.submit(args(side));record(account.tick());$('error').textContent='';render();}catch(e){$('error').textContent=tr(e.message);}};
$('close').onclick=()=>{if(!fresh()){$('error').textContent=language==='es'?'Cotización atrasada; cierre bloqueado.':'Stale quote; close blocked.';return;}record(account.closeAll());render();};$('up').onclick=()=>move(1.005);$('down').onclick=()=>move(.995);$('pause').onclick=()=>{paused=!paused;$('pause').textContent=tr(paused?'Reanudar precio':'Pausar precio');};
$('leverageRange').oninput=()=>{$('leverage').value=$('leverageRange').value;render();};
$('marginRange').oninput=()=>{$('margin').value=(account.available()*Number($('marginRange').value)/100).toFixed(2);render();};
for(const id of ['orderType','limitPrice','mode','margin','leverage','stop','take','sma','ema','bb','rsi'])$(id).oninput=render;
$('timeframe').onchange=()=>{offset=0;render();};$('zoomIn').onclick=()=>{view=Math.max(10,view-10);draw();};$('zoomOut').onclick=()=>{view=Math.min(400,view+10);draw();};$('chartReset').onclick=()=>{offset=0;view=70;draw();};
$('chart').onwheel=e=>{e.preventDefault();view=Math.max(10,Math.min(400,view+(e.deltaY>0?10:-10)));draw();};
$('chart').onpointerdown=e=>{drag={x:e.clientX,offset};$('chart').setPointerCapture(e.pointerId);};$('chart').onpointerup=()=>drag=null;$('chart').onpointercancel=()=>drag=null;
$('chart').onpointermove=e=>{const box=$('chart').getBoundingClientRect();mouse={x:(e.clientX-box.left)*1100/box.width};if(drag)offset=Math.max(0,drag.offset+Math.round((e.clientX-drag.x)*view/box.width));draw();};$('chart').onpointerleave=()=>{mouse=null;draw();};
$('useToken').onclick=()=>{try{if(!$('tokenName').value.trim())throw new Error('Indica el nombre del token.');select($('tokenName').value,$('tokenIdentity').value,Number($('tokenPrice').value));$('tokenStatus').textContent='Escenario cargado.';}catch(e){$('tokenStatus').textContent=tr(e.message);}};
let searchLimit=30;let suggestionTimer,searchAbort;const searchCache=new Map();
async function searchCatalog(){
 clearTimeout(suggestionTimer);searchAbort?.abort();const controller=new AbortController();searchAbort=controller;
 const q=$('search').value.trim(),version=++searchVersion;$('results').replaceChildren();
 if(!q){$('searchStatus').textContent='';return;}
 $('searchStatus').textContent=language==='es'?'Buscando monedas…':'Searching coins…';
 try{
 let coins=searchCache.get(q.toLowerCase());
 if(!coins){const response=await fetch('/api/markets-catalog',{signal:controller.signal});if(!response.ok)throw new Error('search');const data=await response.json();coins=(Array.isArray(data.coins)?data.coins:[]).filter(c=>(c.symbol+' '+c.name+' '+c.id).toLowerCase().includes(q.toLowerCase()));searchCache.set(q.toLowerCase(),coins);}
 if(version!==searchVersion)return;
 const known=canonical[q.toLowerCase()];
 const score=c=>String(c.symbol).toLowerCase()===q.toLowerCase()||String(c.name).toLowerCase()===q.toLowerCase()?0:1;
 const unique=[...new Map(coins.filter(c=>c.id&&c.name&&c.symbol).map(c=>[c.id,c])).values()];
 const results=(known?unique.filter(c=>c.id===known[0]):unique.sort((a,b)=>score(a)-score(b)||(a.market_cap_rank||1e9)-(b.market_cap_rank||1e9))).slice(0,searchLimit);
 $('searchStatus').textContent=results.length?(language==='es'?'Selecciona la moneda por nombre e ID. Precios de referencia; catálogo CoinGecko.':'Select by name and ID. Reference prices from the CoinGecko catalog.'):(language==='es'?'No figura en este catálogo. No se sustituirá por otro token del mismo símbolo.':'Not in this catalog. No substitution with a same-symbol token.');
 const buttons=new Map();
 for(const coin of results){const button=document.createElement('button');button.type='button';const label=coin.name+' ('+coin.symbol.toUpperCase()+') · ID: '+coin.id;button.textContent=label+' · …';button.onclick=async()=>{
  const selectionVersion=++searchVersion;searchAbort?.abort();clearTimeout(suggestionTimer);button.disabled=true;
  try{const value=await referencePrice(coin.id);if(selectionVersion!==searchVersion)return;select(coin.name+' · '+coin.symbol.toUpperCase(),'coin:'+coin.id,value,{coin:coin.id});refreshQuotes();loadHistory(coin.id);}
  catch{if(selectionVersion===searchVersion)$('searchStatus').textContent=language==='es'?'Precio no disponible. Intenta de nuevo; no se usará un precio inventado.':'Price unavailable. Retry; no invented price will be used.';}finally{button.disabled=false;}
 };$('results').append(button);buttons.set(coin.id,{button,label});}
 if(unique.length>results.length&&!known){const more=document.createElement('button');more.type='button';more.textContent=language==='es'?'Ver más resultados':'Show more results';more.onclick=()=>{searchLimit+=30;searchCatalog();};$('results').append(more);}
 if(!results.length)return;
 try{const prices=await catalogPrices(results.map(c=>c.id),controller.signal);if(version!==searchVersion)return;for(const [id,{button,label}] of buttons){const value=Number(prices[id]?.usd);button.textContent=label+' · '+(Number.isFinite(value)&&value>0?quote(value)+' USD':(language==='es'?'precio no disponible':'price unavailable'));}}
 catch{if(version===searchVersion)for(const {button,label} of buttons.values())button.textContent=label+' · '+(language==='es'?'consultar precio al seleccionar':'fetch price on selection');}
 }catch(error){if(version===searchVersion&&error.name!=='AbortError')$('searchStatus').textContent=language==='es'?'El catálogo no respondió. Espera un momento y vuelve a buscar.':'Catalog unavailable. Wait a moment and retry.';}
}
$('searchForm').onsubmit=e=>{e.preventDefault();searchCatalog();};
$('search').oninput=()=>{searchLimit=30;clearTimeout(suggestionTimer);searchAbort?.abort();++searchVersion;$('results').replaceChildren();if(!$('search').value.trim()){$('searchStatus').textContent='';return;}suggestionTimer=setTimeout(searchCatalog,400);};
$('search').onkeydown=e=>{if(e.key==='ArrowDown'){$('results').querySelector('button')?.focus();e.preventDefault();}if(e.key==='Escape'){clearTimeout(suggestionTimer);searchAbort?.abort();++searchVersion;$('results').replaceChildren();$('searchStatus').textContent='';}};
$('reset').onclick=()=>{if(!confirm(language==='es'?'¿Borrar esta sesión ficticia?':'Clear this simulated session?'))return;account=new SimulatorAccount();position=null;$('history').replaceChildren();render();};
markets.set(symbol,{name:asset,identity:'BTC',price,charts:{}});account.mark(symbol,price);seed(price);const incoming=new URLSearchParams(location.hash.slice(1));if(incoming.get('symbol')){$('tokenName').value=(incoming.get('name')||incoming.get('symbol')).slice(0,80);$('tokenIdentity').value=[incoming.get('chain'),incoming.get('address')].filter(Boolean).join(' · ').slice(0,200);$('tokenPrice').value=incoming.get('price')||'';if(Number(incoming.get('price'))>0)$('useToken').click();else{$('tokenStatus').textContent='Introduce un precio ficticio para este token.';document.querySelector('details').open=true;}}
async function loadHistory(id){
 const key='coin:'+id,m=markets.get(key);if(!m||m.historyLoading||m.history?.length)return;
 m.historyLoading=true;$('chartStatus').textContent=language==='es'?'Cargando historial público…':'Loading public history…';
 try{const response=await fetch('https://api.coingecko.com/api/v3/coins/'+encodeURIComponent(id)+'/market_chart?vs_currency=usd&days=30',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('history');const data=await response.json();
 m.history=(data.prices||[]).filter(v=>Array.isArray(v)&&Number.isFinite(v[0])&&Number.isFinite(v[1])&&v[1]>0).map(v=>({time:v[0],price:v[1]}));
 if(!m.history.length)throw new Error('empty');m.historyStatus=language==='es'?'Historial público de 30 días: velas de muestras, no OHLC completo.':'30-day public history: sampled candles, not complete OHLC.';
 if(symbol===key){$('timeframe').value='14400';offset=0;}
 }catch{m.historyStatus=language==='es'?'Historial no disponible. Solo se muestran muestras recibidas; no se inventan velas.':'History unavailable. Showing received samples only; no invented candles.';}
 finally{m.historyLoading=false;render();}
}
function fresh(){if(initialQuotePending)return false;return [...markets.entries()].filter(([key])=>key===symbol||account.positions.some(p=>p.symbol===key)||account.orders.some(o=>o.symbol===key)).every(([,m])=>!m.live||(!m.error&&Date.now()-m.updated<=45000));}
async function refreshQuotes(){
 await Promise.all([...markets.entries()].filter(([key,m])=>m.live&&(key===symbol||account.positions.some(p=>p.symbol===key)||account.orders.some(o=>o.symbol===key))).map(async([key,m])=>{
 if(m.busy)return;m.busy=true;try{
 if(m.live.coin){const value=await referencePrice(m.live.coin);m.price=value;m.updated=Date.now();m.error=false;m.samples.push({time:m.updated,price:value});if(m.samples.length>10000)m.samples.shift();account.mark(key,value);return;}
 const response=await fetch('https://api.dexscreener.com/latest/dex/pairs/'+encodeURIComponent(m.live.chain)+'/'+encodeURIComponent(m.live.pair),{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('quote');const data=await response.json(),pair=data.pairs?.find(p=>p.pairAddress===m.live.pair&&p.baseToken?.address===m.live.token),value=Number(pair?.priceUsd);
 if(!Number.isFinite(value)||value<=0)throw new Error('quote');
 m.price=value;m.updated=Date.now();m.error=false;m.samples.push({time:m.updated,price:value});if(m.samples.length>10000)m.samples.shift();account.mark(key,value);
 }catch{m.error=true;}finally{m.busy=false;}
 }));
 price=markets.get(symbol).price;if(fresh())record(account.tick());render();
}
setInterval(refreshQuotes,15000);
setInterval(()=>{if(!paused&&!initialQuotePending){for(const [key,m] of markets){if(m.live)continue;m.price*=1+(Math.random()-.5)*.001;account.mark(key,m.price);}price=markets.get(symbol).price;if(fresh())record(account.tick());}render();},1000);render();
for(const id of ['searchStatus','tokenStatus'])new MutationObserver(()=>{const el=$(id),text=tr(el.textContent);if(text!==el.textContent)el.textContent=text;}).observe($(id),{childList:true,characterData:true,subtree:true});
for(const action of ['deposit','withdraw'])$(action).onclick=()=>{$('fundingStatus').textContent=language==='es'?'No conectado. Falta elegir y configurar tu wallet o exchange. No envíes fondos a esta demo.':'Not connected. Choose and configure your wallet or exchange first. Do not send funds to this demo.';};
if(initialQuotePending){$('identity').textContent=language==='es'?'Consultando Bitcoin real…':'Fetching Bitcoin reference price…';referencePrice('bitcoin').then(value=>{if(!initialQuotePending)return;select('Bitcoin · BTC','coin:bitcoin',value,{coin:'bitcoin'});loadHistory('bitcoin');}).catch(()=>{$('error').textContent=language==='es'?'No se pudo consultar BTC. Busca Bitcoin para reintentar. No se muestra un precio ficticio.':'BTC unavailable. Search Bitcoin to retry. No simulated quote is displayed.';});}
