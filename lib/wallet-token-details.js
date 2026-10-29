import {createWalletCandleChart} from './wallet-candle-chart.js';
const SOL_MINT='So11111111111111111111111111111111111111112';
export function selectTokenMarket(pairs,mint){
 return (Array.isArray(pairs)?pairs:[]).filter(pair=>pair.chainId==='solana'&&pair.baseToken?.address===mint&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair.pairAddress||''))
  .sort((a,b)=>(Number(b.liquidity?.usd)||0)-(Number(a.liquidity?.usd)||0))[0]||null;
}
export function createWalletTokenDetails(language,doc,win){
 const t=(es,en)=>language==='es'?es:en;
 const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const element=node('section');element.hidden=true;element.className='card wallet-token-details';element.tabIndex=-1;element.setAttribute('role','region');element.setAttribute('aria-labelledby','wallet-token-detail-heading');
 let revision=0,controller,opener;
 const close=(restoreFocus=false)=>{revision++;controller?.abort();element.hidden=true;element.replaceChildren();if(restoreFocus&&opener?.isConnected){opener.focus?.({preventScroll:true});opener.scrollIntoView?.({block:'center',behavior:'auto'});}opener=null;};
 async function open(token,trigger){
  close(false);opener=trigger;element.hidden=false;element.setAttribute('aria-busy','true');
  const id=revision,mint=token.mint||(token.symbol==='SOL'?SOL_MINT:'');
  const heading=node('h3',String(token.symbol||'Token').slice(0,44));
  heading.id='wallet-token-detail-heading';
  const dismiss=node('button',t('Cerrar detalles','Close details'));dismiss.type='button';dismiss.onclick=()=>close(true);
  const identity=node('p',`Solana · ${mint||t('Dirección no disponible','Address unavailable')}`);identity.style.overflowWrap='anywhere';
  const status=node('p',t('Consultando mercado…','Loading market…'));status.setAttribute('role','status');
  const verification=node('p',t('Verificación: consultando fuente…','Verification: checking source…'));
  element.append(heading,dismiss,identity,verification,node('p',t('Una verificación de listado no es una auditoría ni garantiza seguridad o rentabilidad.','Listing verification is not an audit or a guarantee of safety or profit.')),status);
  element.focus?.({preventScroll:true});
  element.scrollIntoView?.({block:'start',behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)){verification.textContent=t('Verificación no disponible.','Verification unavailable.');status.textContent=t('No hay una dirección válida para consultar este token.','No valid address is available for this token.');element.setAttribute('aria-busy','false');return;}
  controller=new AbortController();const requestController=controller;const timer=setTimeout(()=>requestController.abort(),20000);
  try{
   const base=win.Capacitor?.isNativePlatform?.()||win.location?.hostname==='localhost'||win.location?.protocol==='capacitor:'?'https://www.jamddmaj.com':'';
   const response=await win.fetch(`${base}/api/wallet-token-research?mint=${mint}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('market');
   const research=await response.json();if(id!==revision)return;
   if(research.mint!==mint||research.network!=='solana:mainnet')throw Error('identity');
   const labels=language==='es'?{verified:'Verificado por Jupiter',unverified:'No verificado por Jupiter',flagged:'Marcado como sospechoso por Jupiter',unknown:'Estado no disponible'}:{verified:'Verified by Jupiter',unverified:'Not verified by Jupiter',flagged:'Flagged as suspicious by Jupiter',unknown:'Status unavailable'};
   const observed=Date.parse(research.updatedAt);
   verification.textContent=`${labels[research.verification?.status]||labels.unknown} · Jupiter Tokens V2${Number.isFinite(observed)?' · '+new Date(observed).toLocaleString(language):''}`;
   const market=research.market;
   if(!market){status.textContent=t('Sin mercado indexado para esta dirección. No se inventan precios ni gráficos.','No indexed market for this address. Prices and charts are not fabricated.');return;}
   const number=value=>Number.isFinite(Number(value))&&value!==null&&value!==undefined?Number(value).toLocaleString(language,{maximumSignificantDigits:7}):'—';
   status.textContent=`${market.name||token.symbol||'Token'} · ${market.dex||'DEX Screener'}${market.quoteSymbol?' · '+(market.symbol||token.symbol||'Token')+'/'+market.quoteSymbol:''}`;
   const metrics=node('dl');metrics.className='wallet-token-metrics';metrics.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:16px 0';
   const unavailable=t('No disponible','Unavailable');
   const value=(n,suffix='')=>n===null||n===undefined||n===''||!Number.isFinite(Number(n))?unavailable:number(n)+suffix;
   for(const[label,n,suffix]of [
    [t('Precio · USD','Price · USD'),market.priceUsd,''],
    [t('Capitalización · USD','Market cap · USD'),market.marketCapUsd,''],
    [t('Valoración diluida · USD','FDV · USD'),market.fdvUsd,''],
    [t('Liquidez del par · USD','Pair liquidity · USD'),market.liquidityUsd,''],
    [t('Volumen del par · 24 h USD','Pair volume · 24h USD'),market.volume24h,''],
    [t('Cambio · 1 h','Change · 1h'),market.change1h,'%'],
    [t('Cambio · 6 h','Change · 6h'),market.change6h,'%'],
    [t('Cambio · 24 h','Change · 24h'),market.change24h,'%'],
    [t('Compras del par · 24 h','Pair buys · 24h'),market.buys24h,''],
    [t('Ventas del par · 24 h','Pair sells · 24h'),market.sells24h,'']
   ]){const tile=node('div');tile.style.cssText='padding:12px;border:1px solid #293e50;border-radius:12px;background:#0b1723;min-width:0';const dt=node('dt',label);dt.style.cssText='font-size:12px;color:#a7bacb';const dd=node('dd',value(n,suffix));dd.style.cssText='margin:6px 0 0;font-size:17px;font-weight:600;overflow-wrap:anywhere';tile.append(dt,dd);metrics.append(tile);}
   element.append(metrics,node('p',t('Fuente: DEX Screener. Capitalización y FDV son datos distintos; no se sustituye uno por otro. Volumen, liquidez y compras/ventas corresponden al par seleccionado.','Source: DEX Screener. Market cap and FDV are separate figures; neither replaces the other. Volume, liquidity and buys/sells refer to the selected pair.')));
   const created=Number(market.pairCreatedAt);if(created>0&&Number.isFinite(new Date(created).getTime()))element.append(node('p',`${t('Creación del par','Pair created')}: ${new Date(created).toLocaleString(language)}`));
   const candles=Array.isArray(research.candles)?research.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&c.high>=c.low).slice(-100):[];
   if(candles.length>1&&doc.createElementNS){
    element.append(node('p',`${research.chartSource} · ${t('Velas de 1 hora · USD','1-hour candles · USD')}`),createWalletCandleChart(candles,language,doc));
   }else element.append(node('p',t('Historial de velas no disponible para este par.','Candle history unavailable for this pair.')));
   const chart=node('a',t('Abrir gráfico del par en DEX Screener ↗','Open pair chart on DEX Screener ↗'));
   chart.href=`https://dexscreener.com/solana/${market.pairAddress}`;chart.target='_blank';chart.rel='noopener noreferrer';element.append(chart);
   element.append(node('p',t('Datos orientativos del par con mayor liquidez indexada; no es tu historial ni garantiza que puedas vender.','Indicative data for the highest indexed liquidity pair; not your trade history or a guarantee you can sell.')));
  }catch{if(id===revision){verification.textContent=t('Verificación no disponible.','Verification unavailable.');status.textContent=t('No se pudo consultar el mercado. Tu saldo no ha cambiado.','Market lookup failed. Your balance has not changed.');}}
  finally{clearTimeout(timer);if(id===revision)element.setAttribute('aria-busy','false');}
 }
 return {element,open,close,dispose:close};
}
