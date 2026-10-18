export function setupMarketSentiment(parent,language,doc,request=globalThis.fetch){
 const es=language==='es',card=doc.createElement('section');card.className='card market-sentiment';
 const title=doc.createElement('h2');title.textContent=es?'Pulso del mercado':'Market pulse';
 const status=doc.createElement('p');status.setAttribute('role','status');status.textContent=es?'Consultando sentimiento…':'Checking sentiment…';
 const meter=doc.createElement('meter');meter.min=0;meter.max=100;meter.hidden=true;meter.setAttribute('aria-label',es?'Índice de miedo y codicia de Bitcoin':'Bitcoin Fear and Greed Index');
 const source=doc.createElement('a');source.href='https://alternative.me/crypto/fear-and-greed-index/';source.textContent='Alternative.me · Bitcoin Fear & Greed';source.target='_blank';source.rel='noopener noreferrer';
 const note=doc.createElement('small');note.textContent=es?'Sentimiento de Bitcoin, no tendencia garantizada ni señal de compra.':'Bitcoin sentiment, not a guaranteed trend or a buy signal.';
 card.append(title,status,meter,source,note);parent.insertBefore(card,parent.firstChild||null);
 let disposed=false;
 async function refresh(){try{
  const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
  const response=await request(base+'/api/market-sentiment',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error();const data=await response.json(),age=Date.now()-Date.parse(data.updatedAt);
  if(!Number.isInteger(data.value)||data.value<0||data.value>100||!Number.isFinite(age)||age< -300000||age>172800000||data.scope!=='bitcoin')throw Error();
  if(disposed)return;meter.value=data.value;meter.hidden=false;
  const labels=es?['Miedo extremo','Miedo','Neutral','Codicia','Codicia extrema']:['Extreme fear','Fear','Neutral','Greed','Extreme greed'];
  const index=data.value<25?0:data.value<45?1:data.value<=55?2:data.value<75?3:4;
  status.textContent=data.value+' / 100 · '+labels[index]+' · '+new Date(data.updatedAt).toLocaleDateString(language);
 }catch{if(!disposed){meter.hidden=true;status.textContent=es?'Sentimiento no disponible.':'Sentiment unavailable.';}}}
 refresh();const timer=setInterval(refresh,900000);timer?.unref?.();
 return {card,dispose(){disposed=true;clearInterval(timer);card.remove();}};
}
