export function setupFinanceDepth(parent,language,doc=document,request=globalThis.fetch){
  const t=(es,en)=>language==='es'?es:en;
  const status=doc.createElement('p');status.setAttribute('role','status');
  const rows=doc.createElement('div');const refresh=doc.createElement('button');refresh.textContent=t('Actualizar libro','Refresh order book');
  parent.replaceChildren();const title=doc.createElement('h2');title.textContent=t('Libro de órdenes · Bitget','Order book · Bitget');parent.append(title,status,rows,refresh);
  let symbol='',revision=0,timer,expiry,disposed=false;
  const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
  async function load(){
    if(!symbol||disposed)return;clearTimeout(timer);clearTimeout(expiry);const ticket=++revision;
    rows.replaceChildren();refresh.disabled=true;status.textContent=t('Consultando…','Loading…');
    try{
      const response=await request(base+'/api/market-depth?symbol='+encodeURIComponent(symbol),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();const data=await response.json();if(ticket!==revision||disposed)return;
      if(data.symbol!==symbol||data.market!=='USDT-FUTURES'||!Number.isFinite(data.updatedAt)||Date.now()-data.updatedAt>15000||data.updatedAt>Date.now()+5000)throw Error();
      for(const side of ['asks','bids']){
        if(!Array.isArray(data[side])||!data[side].length)throw Error();
        const heading=doc.createElement('h3');heading.textContent=side==='asks'?t('Venta · precio / cantidad','Sell · price / quantity'):t('Compra · precio / cantidad','Buy · price / quantity');rows.append(heading);
        for(const level of data[side].slice(0,8)){
          if(!Number.isFinite(level.price)||level.price<=0||!Number.isFinite(level.quantity)||level.quantity<=0)throw Error();
          const row=doc.createElement('div');row.className='depth-'+side;row.textContent=level.price.toLocaleString(language,{maximumSignificantDigits:9})+' / '+level.quantity.toLocaleString(language,{maximumSignificantDigits:7});rows.append(row);
        }
      }
      status.textContent=symbol+' · '+t('Futuros · actualización cada 5 s','Futures · refresh every 5 s');
      expiry=setTimeout(()=>{if(ticket===revision){rows.replaceChildren();status.textContent=t('Datos vencidos; actualiza el libro.','Stale data; refresh the book.');}},Math.max(0,15000-(Date.now()-data.updatedAt)));expiry?.unref?.();
    }catch{if(ticket===revision&&!disposed){rows.replaceChildren();status.textContent=t('Libro no disponible para este par.','Order book unavailable for this pair.');}}
    finally{if(ticket===revision&&!disposed){refresh.disabled=false;schedule();}}
  }
  function schedule(){timer=setTimeout(()=>{if(!doc.hidden&&!parent.closest?.('[hidden]'))load();else schedule();},5000);timer?.unref?.();}
  refresh.onclick=load;status.textContent=t('Selecciona un par en Mercados.','Select a pair in Markets.');
  return {select(value){symbol=value;++revision;load();},dispose(){disposed=true;++revision;clearTimeout(timer);clearTimeout(expiry);}};
}
