// Read-only interaction over the fetched historical snapshot; never implies live prices.
export function createWalletCandleChart(candles, language, doc) {
 const es=language==='es', root=doc.createElement('div');root.className='wallet-candle-chart';
 const tools=doc.createElement('div');tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 const readout=doc.createElement('p');readout.style.cssText='font-size:12px;min-height:3em;font-variant-numeric:tabular-nums';
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 800 360');svg.setAttribute('tabindex','0');svg.setAttribute('role','group');
 svg.setAttribute('aria-label',es?'Gráfico de velas: flechas para explorar, más y menos para zoom':'Candle chart: arrow keys to explore, plus and minus to zoom');
 svg.setAttribute('preserveAspectRatio','none');
 svg.style.cssText='width:100%;height:clamp(240px,38vw,400px);display:block;touch-action:pan-y;user-select:none';
 let count=Math.min(60,candles.length),start=candles.length-count,selected=candles.length-1;
 const pointers=new Map();let drag=null,pinch=null;
 const price=n=>n.toLocaleString(language,{maximumSignificantDigits:7});
 function shape(tag,attrs,text){const n=doc.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;}
 function render(){
  count=Math.max(Math.min(8,candles.length),Math.min(candles.length,Math.round(count)));
  start=Math.max(0,Math.min(candles.length-count,Math.round(start)));selected=Math.max(start,Math.min(start+count-1,selected));
  const visible=candles.slice(start,start+count),low=Math.min(...visible.map(c=>c.low)),high=Math.max(...visible.map(c=>c.high));
  const span=high-low||high*.01||1,y=p=>300-(p-low)/span*270,step=680/count;
  svg.replaceChildren();
  for(let i=0;i<4;i++){const p=low+span*i/3;shape('line',{x1:10,x2:695,y1:y(p),y2:y(p),stroke:'#273849'});shape('text',{x:701,y:y(p)+4,fill:'#9cb0c4','font-size':12},price(p));}
  visible.forEach((c,i)=>{const x=10+(i+.5)*step,color=c.close>=c.open?'#29d6b0':'#ff587b';shape('line',{x1:x,x2:x,y1:y(c.high),y2:y(c.low),stroke:color});shape('rect',{x:x-step*.3,y:Math.min(y(c.open),y(c.close)),width:Math.max(1,step*.6),height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color});});
  const c=candles[selected],x=10+(selected-start+.5)*step;
  shape('line',{x1:x,x2:x,y1:20,y2:305,stroke:'#d6e2ef','stroke-dasharray':'3 4'});
  shape('circle',{cx:x,cy:y(c.close),r:4,fill:'#fff'});
  for(const [index,anchor,xpos]of [[start,'start',10],[start+count-1,'end',690]])shape('text',{x:xpos,y:337,fill:'#9cb0c4','font-size':12,'text-anchor':anchor},new Date(candles[index].time*1000).toLocaleString(language));
  readout.textContent=`${new Date(c.time*1000).toLocaleString(language)} · O ${price(c.open)} · H ${price(c.high)} · L ${price(c.low)} · C ${price(c.close)} USD`;
 }
 function zoom(factor,anchor=.5){const point=start+count*anchor;count*=factor;count=Math.max(Math.min(8,candles.length),Math.min(candles.length,Math.round(count)));start=point-count*anchor;render();}
 for(const[label,action]of [['−',()=>zoom(1.3)],['+',()=>zoom(1/1.3)],[es?'Restablecer':'Reset',()=>{count=Math.min(60,candles.length);start=candles.length-count;selected=candles.length-1;render();}]]){const b=doc.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label==='+'?(es?'Acercar':'Zoom in'):label==='−'?(es?'Alejar':'Zoom out'):label);b.onclick=action;tools.append(b);}
 function position(e){const r=svg.getBoundingClientRect();return Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*800-10)/680));}
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.15:1/1.15,position(e));},{passive:false});
 svg.addEventListener('pointerdown',e=>{
  svg.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  selected=start+Math.min(count-1,Math.floor(position(e)*count));render();
  if(pointers.size===1)drag={x:e.clientX,y:e.clientY,start,axis:null};
  if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),count,center:start+count/2};drag=null;}
 });
 svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)){if(e.pointerType==='mouse'){selected=start+Math.min(count-1,Math.floor(position(e)*count));render();}return;}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0&&pinch.distance>0){count=pinch.count*pinch.distance/d;start=pinch.center-count/2;render();}return;}
  if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.axis&&Math.max(Math.abs(dx),Math.abs(dy))>6)drag.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';
  if(drag.axis==='x'){start=drag.start-dx/(svg.getBoundingClientRect().width*.85)*count;render();}
 });
 const release=e=>{pointers.delete(e.pointerId);drag=null;pinch=null;};
 svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);
 svg.addEventListener('dblclick',()=>{count=Math.min(60,candles.length);start=candles.length-count;render();});
 svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','+','=','-'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight'){selected=Math.max(0,Math.min(candles.length-1,selected+(e.key==='ArrowLeft'?-1:1)));if(selected<start)start=selected;if(selected>=start+count)start=selected-count+1;render();}else zoom(e.key==='-'?1.3:1/1.3);}});
 const help=doc.createElement('p');help.style.fontSize='12px';help.textContent=es?'Toca una vela · arrastra horizontalmente · pellizca o usa la rueda para zoom. Historial de 1 h; no es precio en vivo.':'Tap a candle · drag horizontally · pinch or scroll to zoom. 1h history; not a live price.';
 root.append(tools,readout,svg,help);render();return root;
}
