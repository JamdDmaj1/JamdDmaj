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
   status.textContent=`DEX Screener · ${t('Precio USD','Price USD')}: ${number(market.priceUsd)} · 24h: ${number(market.change24h)}% · ${t('Liquidez USD','Liquidity USD')}: ${number(market.liquidityUsd)} · ${t('Volumen 24h USD','24h volume USD')}: ${number(market.volume24h)}`;
   const candles=Array.isArray(research.candles)?research.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&c.high>=c.low).slice(-100):[];
   if(candles.length>1&&doc.createElementNS){
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 320');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('Velas históricas del token en USD, intervalo una hora','Historical token candles in USD, one hour interval'));svg.style.width='100%';svg.style.maxHeight='420px';
    const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high));
    const y=price=>285-(price-low)/(high-low||1)*260,step=730/candles.length;
    for(let i=0;i<candles.length;i++){
     const c=candles[i],color=c.close>=c.open?'#29d6b0':'#ff587b',x=10+i*step;
     const wick=doc.createElementNS(svg.namespaceURI,'line');for(const [key,value]of Object.entries({x1:x,x2:x,y1:y(c.high),y2:y(c.low),stroke:color}))wick.setAttribute(key,String(value));
     const body=doc.createElementNS(svg.namespaceURI,'rect');for(const [key,value]of Object.entries({x:x-step*.3,y:Math.min(y(c.open),y(c.close)),width:Math.max(1,step*.6),height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color}))body.setAttribute(key,String(value));svg.append(wick,body);
    }
    element.append(node('p',`${research.chartSource} · ${new Date(candles[0].time*1000).toLocaleString(language)} — ${new Date(candles.at(-1).time*1000).toLocaleString(language)} · USD ${number(low)}–${number(high)}`),svg);
   }else element.append(node('p',t('Historial de velas no disponible para este par.','Candle history unavailable for this pair.')));
   const chart=node('a',t('Abrir gráfico del par en DEX Screener ↗','Open pair chart on DEX Screener ↗'));
   chart.href=`https://dexscreener.com/solana/${market.pairAddress}`;chart.target='_blank';chart.rel='noopener noreferrer';element.append(chart);
   element.append(node('p',t('Datos orientativos del par con mayor liquidez indexada; no es tu historial ni garantiza que puedas vender.','Indicative data for the highest indexed liquidity pair; not your trade history or a guarantee you can sell.')));
  }catch{if(id===revision){verification.textContent=t('Verificación no disponible.','Verification unavailable.');status.textContent=t('No se pudo consultar el mercado. Tu saldo no ha cambiado.','Market lookup failed. Your balance has not changed.');}}
  finally{clearTimeout(timer);if(id===revision)element.setAttribute('aria-busy','false');}
 }
 return {element,open,close,dispose:close};
}
