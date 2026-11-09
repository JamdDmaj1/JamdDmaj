// Public market data only: no credentials, signing or order submission.
export function parseLiveDepth(message,symbol,lastSequence=0,now=Date.now()){
  if(message?.action!=='snapshot'||message.arg?.instType!=='USDT-FUTURES'||message.arg?.channel!=='books15'||message.arg?.instId!==symbol)return null;
  const data=message.data?.[0],sequence=Number(data?.seq),updatedAt=Number(data?.ts);
  if(!Number.isSafeInteger(sequence)||sequence<=0||!Number.isFinite(updatedAt)||now-updatedAt>15000||updatedAt>now+5000)throw Error('Invalid or stale depth');
  if(sequence<=lastSequence)return null;
  const result={sequence,updatedAt};
  for(const side of ['asks','bids']){
    if(!Array.isArray(data[side])||!data[side].length||data[side].length>15)throw Error('Invalid levels');
    result[side]=data[side].map(level=>{const price=Number(level[0]),quantity=Number(level[1]);if(!Number.isFinite(price)||price<=0||!Number.isFinite(quantity)||quantity<=0)throw Error('Invalid level');return {price,quantity};});
    result[side].sort((a,b)=>side==='asks'?a.price-b.price:b.price-a.price);
  }
  if(result.bids[0].price>=result.asks[0].price)throw Error('Crossed book');
  return result;
}
export function setupFinanceDepth(parent,language,doc=document,_request=globalThis.fetch,Socket=doc.defaultView?.WebSocket){
  const t=(es,en)=>language==='es'?es:en;
  const title=doc.createElement('h2');title.textContent=t('Libro de órdenes · en vivo','Order book · live');
  const status=doc.createElement('p');status.setAttribute('role','status');
  const rows=doc.createElement('div'),refresh=doc.createElement('button');refresh.textContent=t('Reconectar','Reconnect');
  parent.replaceChildren();parent.append(title,status,rows,refresh);
  const cells={},mid=doc.createElement('div');mid.className='depth-mid';mid.setAttribute('aria-live','off');
  for(const side of ['asks','bids']){if(side==='bids')rows.append(mid);const heading=doc.createElement('h3');heading.textContent=side==='asks'?t('Venta · precio / cantidad','Sell · price / quantity'):t('Compra · precio / cantidad','Buy · price / quantity');rows.append(heading);cells[side]=Array.from({length:15},()=>{const row=doc.createElement('div');row.className='depth-'+side;if(row.style)row.style.animation='none';rows.append(row);return row;});}
  let symbol='',socket,disposed=false,active=true,generation=0,sequence=0,retry,heartbeat,watchdog,attempt=0,lastReceive=0,pong=true;
  function clear(){mid.textContent='—';for(const side of ['asks','bids'])for(const row of cells[side]){row.textContent='';row.hidden=true;}}
  function stop(){++generation;clearTimeout(retry);clearInterval(heartbeat);clearInterval(watchdog);const old=socket;socket=null;if(old){old.onopen=old.onmessage=old.onerror=old.onclose=null;old.close();}}
  function failed(ticket){if(ticket!==generation||disposed)return;stop();clear();status.textContent=t('Conexión interrumpida; reconectando…','Connection interrupted; reconnecting…');if(active&&!doc.hidden){retry=setTimeout(start,Math.min(30000,1000*2**Math.min(attempt++,5)));retry?.unref?.();}}
  function start(){
    stop();clear();sequence=0;if(disposed||!active||doc.hidden||!symbol)return;
    if(!Socket){status.textContent=t('El navegador no permite la conexión en vivo.','This browser does not support the live connection.');return;}
    status.textContent=t('Conectando al flujo en vivo…','Connecting to live stream…');const ticket=generation;
    try{socket=new Socket('wss://ws.bitget.com/v2/ws/public');}catch{failed(ticket);return;}
    lastReceive=Date.now();pong=true;
    socket.onopen=()=>{if(ticket===generation)socket.send(JSON.stringify({op:'subscribe',args:[{instType:'USDT-FUTURES',channel:'books15',instId:symbol}]}));};
    socket.onmessage=event=>{
      if(ticket!==generation||disposed)return;if(event.data==='pong'){pong=true;return;}
      try{if(typeof event.data!=='string'||event.data.length>100000)throw Error();const message=JSON.parse(event.data);if(message.event==='error')throw Error();const data=parseLiveDepth(message,symbol,sequence);if(!data)return;
        sequence=data.sequence;lastReceive=Date.now();attempt=0;
        const bid=data.bids[0].price,ask=data.asks[0].price;mid.textContent=t('Punto medio: ','Midpoint: ')+((bid+ask)/2).toLocaleString(language,{maximumSignificantDigits:9})+' · Spread '+(ask-bid).toLocaleString(language,{maximumSignificantDigits:5});
        for(const side of ['asks','bids']){
          const levels=data[side].slice(0,6);if(side==='asks')levels.reverse();
          const max=Math.max(...levels.map(l=>l.quantity));
          cells[side].forEach((row,i)=>{const level=levels[i];row.hidden=!level;if(!level)return;row.style?.setProperty?.('--depth-fill',(100*level.quantity/max)+'%');row.textContent=level.price.toLocaleString(language,{maximumSignificantDigits:9})+' / '+level.quantity.toLocaleString(language,{maximumSignificantDigits:7});});
        }
        status.textContent=symbol+' · '+t('En vivo · datos públicos de Bitget','Live · public Bitget data');
      }catch{failed(ticket);}
    };
    socket.onerror=socket.onclose=()=>failed(ticket);
    heartbeat=setInterval(()=>{if(ticket!==generation)return;if(!pong||socket?.readyState!==1){failed(ticket);return;}pong=false;socket.send('ping');},30000);heartbeat?.unref?.();
    watchdog=setInterval(()=>{if(Date.now()-lastReceive>15000)failed(ticket);},1000);watchdog?.unref?.();
  }
  const visibility=()=>{if(doc.hidden){stop();clear();status.textContent=t('Flujo pausado mientras la app está oculta.','Stream paused while the app is hidden.');}else if(active)start();};
  doc.addEventListener?.('visibilitychange',visibility);refresh.onclick=()=>{attempt=0;start();};clear();status.textContent=t('Selecciona un par en Mercados.','Select a pair in Markets.');
  return {select(value){if(!/^[A-Z0-9]{2,24}USDT$/.test(value))return;symbol=value;attempt=0;start();},setActive(value){if(active===value)return;active=value;if(active)start();else{stop();clear();}},dispose(){disposed=true;stop();doc.removeEventListener?.('visibilitychange',visibility);}};
}
