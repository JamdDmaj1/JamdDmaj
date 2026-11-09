// Public OHLC only. This renderer never reads wallet data or submits orders.
export function validCandles(rows) {
  return [...new Map((Array.isArray(rows)?rows:[]).filter(c=>
    ['time','open','high','low','close'].every(k=>Number.isFinite(c[k])&&c[k]>0)&&
    c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)
  ).map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time).slice(-120);
}
export function setupCandleChart(parent,raw,language,doc,options={}){
  const rows=validCandles(raw),es=language==='es';if(rows.length<2)return false;
  const make=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const tools=make('div');tools.className='terminal-shortcuts';
  const symbol=String(options.symbol||'');const storeKey='jamd-chart-drawings';
  const emptyDrawings=()=>({h:[],trend:[],zone:[]});
  const readDrawings=()=>{try{const raw=doc.defaultView?.localStorage?.getItem?.(storeKey);const all=raw?JSON.parse(raw):{};const entry=all[symbol];if(Array.isArray(entry))return {h:entry.filter(v=>Number.isFinite(v)&&v>0).slice(0,20),trend:[],zone:[]};if(!entry||typeof entry!=='object')return emptyDrawings();const clean=list=>Array.isArray(list)?list.slice(0,20):[];return {h:clean(entry.h).filter(v=>Number.isFinite(v)&&v>0),trend:clean(entry.trend).filter(d=>['t1','p1','t2','p2'].every(k=>Number.isFinite(d[k]))),zone:clean(entry.zone).filter(d=>Number.isFinite(d.p1)&&Number.isFinite(d.p2))};}catch{return emptyDrawings();}};
  const saveDrawings=value=>{try{const raw=doc.defaultView?.localStorage?.getItem?.(storeKey);const all=raw?JSON.parse(raw):{};all[symbol]=value;doc.defaultView?.localStorage?.setItem?.(storeKey,JSON.stringify(all));}catch{}};
  let drawings=readDrawings(),mode=null,pending=null;
  const info=make('p');info.setAttribute('role','status');
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 720 360');svg.setAttribute('role','img');svg.setAttribute('aria-label',es?'Velas OHLC y volumen':'OHLC candles and volume');
  svg.setAttribute('preserveAspectRatio','none');
  let count=60,offset=0,ma=true,ema20=false,ema50=false,vwap=false,rsi=false,view;
  const pointers=new Map();let drag,pinch;
  svg.setAttribute('tabindex','0');
  if(svg.style){svg.style.touchAction='none';svg.style.cursor='crosshair';}
  const element=(tag,attrs,text)=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
  const describe=c=>{info.textContent=new Date(c.time).toLocaleString(language)+` · O ${c.open} H ${c.high} L ${c.low} C ${c.close} · `+(Number.isFinite(c.volume)&&c.volume>=0?'Vol '+c.volume:(es?'Volumen no disponible':'Volume unavailable'));};
  const emaAt=(index,period)=>{const k=2/(period+1);let value=null;for(let i=0;i<=index;i++)value=value===null?rows[i].close:rows[i].close*k+value*(1-k);return value;};
  const vwapAt=index=>{let pv=0,vol=0;for(let i=0;i<=index;i++){const c=rows[i],v=Number.isFinite(c.volume)&&c.volume>0?c.volume:1;pv+=((c.high+c.low+c.close)/3)*v;vol+=v;}return vol?pv/vol:null;};
  const rsiAt=index=>{const period=14;if(index<period)return null;let gain=0,loss=0;for(let i=index-period+1;i<=index;i++){const change=rows[i].close-rows[i-1].close;if(change>=0)gain+=change;else loss-=change;}const rs=loss===0?100:gain/loss;return loss===0?100:100-100/(1+rs/period);};
  function draw(){
    svg.replaceChildren();offset=Math.round(Math.max(0,Math.min(offset,rows.length-2)));const end=rows.length-offset,start=Math.max(0,end-Math.round(count)),visible=rows.slice(start,end);
    const low=Math.min(...visible.map(c=>c.low)),high=Math.max(...visible.map(c=>c.high)),span=high-low||high*.01;
    const y=v=>260-(v-low)/span*230,step=620/visible.length,maxVol=Math.max(1,...visible.map(c=>Number.isFinite(c.volume)?c.volume:0));
    view={visible,low,span,step,start,end};
    for(let i=0;i<=4;i++){const value=low+span*i/4,yy=y(value);element('line',{x1:10,x2:635,y1:yy,y2:yy,stroke:'#263750'});element('text',{x:640,y:yy+4,fill:'#9badc5','font-size':11},value.toLocaleString(language,{maximumSignificantDigits:6}));}
    visible.forEach((c,i)=>{
      const x=10+(i+.5)*step,color=c.close>=c.open?'#20c79b':'#ff5262';
      element('line',{x1:x,x2:x,y1:y(c.high),y2:y(c.low),stroke:color});
      const body=element('rect',{x:x-step*.32,y:Math.min(y(c.open),y(c.close)),width:Math.max(1,step*.64),height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color,tabindex:0,role:'img','aria-label':new Date(c.time).toLocaleString(language)+` O ${c.open} H ${c.high} L ${c.low} C ${c.close}`});
      body.onpointerenter=body.onfocus=()=>describe(c);
      if(!rsi&&Number.isFinite(c.volume)&&c.volume>=0)element('rect',{x:x-step*.32,y:330-c.volume/maxVol*45,width:Math.max(1,step*.64),height:c.volume/maxVol*45,fill:color,opacity:.5});
    });
    if(ma){const points=[];for(let i=start;i<end;i++){if(i<19)continue;const average=rows.slice(i-19,i+1).reduce((sum,c)=>sum+c.close,0)/20;if(average>=low&&average<=high)points.push(`${10+(i-start+.5)*step},${y(average)}`);}element('polyline',{points:points.join(' '),fill:'none',stroke:'#cf9dff','stroke-width':1.5});}
    for(const price of drawings.h){if(price<low||price>high)continue;const yy=y(price);element('line',{x1:10,x2:635,y1:yy,y2:yy,stroke:'#f5c15c','stroke-dasharray':'6 4','stroke-width':1.2});element('text',{x:640,y:yy+4,fill:'#f5c15c','font-size':10},price.toLocaleString(language,{maximumSignificantDigits:7}));}
    for(const zone of drawings.zone){const top=Math.max(zone.p1,zone.p2),bottom=Math.min(zone.p1,zone.p2);if(top<low||bottom>high)continue;const yTop=y(Math.min(high,top)),yBottom=y(Math.max(low,bottom));element('rect',{x:10,y:yTop,width:625,height:Math.max(1,yBottom-yTop),fill:'#7fe3c4',opacity:.12});}
    for(const trend of drawings.trend){const i1=rows.findIndex(c=>c.time>=trend.t1),i2=rows.findIndex(c=>c.time>=trend.t2);if(i1<start||i2<start||i1>=end||i2>=end)continue;element('line',{x1:10+(i1-start+.5)*step,y1:y(trend.p1),x2:10+(i2-start+.5)*step,y2:y(trend.p2),stroke:'#7ea6ff','stroke-width':1.4});}
    if(rsi){
      const top=300,height=45,toY=value=>top+height-(Math.max(0,Math.min(100,value))/100)*height;
      element('rect',{x:10,y:top,width:625,height:height,fill:'#0a1423',stroke:'#263750'});
      for(const guide of [30,70])element('line',{x1:10,x2:635,y1:toY(guide),y2:toY(guide),stroke:'#263750','stroke-dasharray':'4 4'});
      const points=[];for(let i=start;i<end;i++){const value=rsiAt(i);if(value===null)continue;points.push((10+(i-start+.5)*step)+','+toY(value));}
      if(points.length>1){element('polyline',{points:points.join(' '),fill:'none',stroke:'#b07cff','stroke-width':'1.6'});}
      element('text',{x:640,y:toY(70)+4,fill:'#9badc5','font-size':10},'70');element('text',{x:640,y:toY(30)+4,fill:'#9badc5','font-size':10},'30');
    }
    const line=(getValue,color)=>{const points=[];for(let i=start;i<end;i++){const value=getValue(i);if(!Number.isFinite(value)||value<low||value>high)continue;points.push((10+(i-start+.5)*step)+','+y(value));}if(points.length>1)element('polyline',{points:points.join(' '),fill:'none',stroke:color,'stroke-width':'1.6','stroke-linejoin':'round'});};
    if(ema20)line(i=>emaAt(i,20),'#f5c15c');if(ema50)line(i=>emaAt(i,50),'#7ea6ff');if(vwap)line(vwapAt,'#b07cff');
    for(const i of [0,Math.floor((visible.length-1)/2),visible.length-1])element('text',{x:10+i*step,y:352,fill:'#9badc5','font-size':10},new Date(visible[i].time).toLocaleDateString(language));
    describe(visible.at(-1));
  }
  const point=e=>{const r=svg.getBoundingClientRect();return {x:(e.clientX-r.left)*720/r.width,y:(e.clientY-r.top)*360/r.height};};
  function zoom(factor,x){const old=Math.min(count,rows.length-offset),anchor=rows.length-offset-old+Math.max(0,Math.min(1,(x-10)/620))*old;count=Math.max(Math.min(10,rows.length),Math.min(rows.length,old*factor));offset=Math.max(0,Math.min(rows.length-count,Math.round(rows.length-anchor-(1-Math.max(0,Math.min(1,(x-10)/620)))*count)));count=Math.round(count*100)/100;draw();}
  function clickAt(p){
   if(!mode||p.y<30||p.y>260)return;
   const price=Math.round((view.low+(260-p.y)/230*view.span)*100000000)/100000000;
   const index=Math.max(view.start,Math.min(view.end-1,view.start+Math.floor((p.x-10)/view.step)));
   const time=rows[index]?.time;
   if(mode==='h'){drawings={...drawings,h:[...drawings.h,price].slice(-20)};saveDrawings(drawings);setMode(null);}
   else if(mode==='zone'){if(pending===null){pending=price;info.textContent=(es?'Segundo clic para cerrar la zona':'Second click to close the zone')+' '+price;}else{drawings={...drawings,zone:[...drawings.zone,{p1:pending,p2:price}].slice(-20)};pending=null;saveDrawings(drawings);setMode(null);}draw();}
   else if(mode==='trend'){if(pending===null){pending={time,price};info.textContent=(es?'Segundo clic para terminar la tendencia':'Second click to finish the trend');}else{drawings={...drawings,trend:[...drawings.trend,{t1:pending.time,p1:pending.price,t2:time,p2:price}].slice(-20)};pending=null;saveDrawings(drawings);setMode(null);}draw();}
  }
  function setMode(next){mode=next;pending=null;if(svg.style)svg.style.cursor=next?'copy':'crosshair';for(const button of tools.querySelectorAll?.('button[data-tool]')||[])button.setAttribute('aria-pressed',String(button.dataset.tool===next));}
  function crosshair(p){for(const n of svg.querySelectorAll?.('[data-crosshair]')||[])n.remove();if(p.x<10||p.x>630||p.y<30||p.y>260)return;const c=view.visible[Math.min(view.visible.length-1,Math.floor((p.x-10)/view.step))];describe(c);for(const attrs of [{x1:p.x,x2:p.x,y1:30,y2:330},{x1:10,x2:635,y1:p.y,y2:p.y}])element('line',{...attrs,stroke:'#aabbd0','stroke-dasharray':'3 4','data-crosshair':'true','pointer-events':'none'});element('text',{x:640,y:p.y+4,fill:'#ffffff','font-size':11,'data-crosshair':'true','pointer-events':'none'},(view.low+(260-p.y)/230*view.span).toLocaleString(language,{maximumSignificantDigits:7}));}
  svg.addEventListener?.('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.003),point(e).x);},{passive:false});
  svg.addEventListener?.('click',e=>{if(mode)clickAt(point(e));});
  svg.addEventListener?.('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;const p=point(e);pointers.set(e.pointerId,p);svg.setPointerCapture?.(e.pointerId);drag={x:p.x,offset};if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)};}if(svg.style)svg.style.cursor='grabbing';});
  svg.addEventListener?.('pointermove',e=>{const p=point(e);if(!pointers.has(e.pointerId)){crosshair(p);return;}pointers.set(e.pointerId,p);if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch?.distance>0&&distance>0)zoom(pinch.distance/distance,(a.x+b.x)/2);pinch={distance};}else if(drag){offset=Math.max(0,Math.min(rows.length-Math.min(count,rows.length),drag.offset+Math.round((p.x-drag.x)/620*Math.min(count,rows.length))));draw();}});
  const release=e=>{pointers.delete(e.pointerId);pinch=null;drag=pointers.size?{x:[...pointers.values()][0].x,offset}:null;if(svg.style)svg.style.cursor='crosshair';};
  svg.addEventListener?.('pointerup',release);svg.addEventListener?.('pointercancel',release);
  svg.addEventListener?.('pointerleave',()=>{if(!pointers.size)draw();});
  svg.addEventListener?.('dblclick',()=>{count=60;offset=0;draw();});
  svg.addEventListener?.('keydown',e=>{if(!['ArrowLeft','ArrowRight','+','-','Home'].includes(e.key))return;e.preventDefault();if(e.key==='+'||e.key==='-')zoom(e.key==='+'?.8:1.25,320);else{if(e.key==='Home'){count=60;offset=0;}else offset=Math.max(0,Math.min(rows.length-Math.min(count,rows.length),offset+(e.key==='ArrowLeft'?5:-5)));draw();}});
  for(const[label,action]of [['+',()=>{count=Math.max(10,count-15);}],['−',()=>{count=Math.min(120,count+15);}],['←',()=>{offset=Math.min(rows.length-2,offset+15);}],['→',()=>{offset=Math.max(0,offset-15);}],['SMA20',()=>{ma=!ma;}],[es?'Restablecer':'Reset',()=>{count=60;offset=0;ma=true;}]]){
    const b=make('button',label);b.type='button';b.setAttribute('aria-label',({'+' : es?'Acercar':'Zoom in','−':es?'Alejar':'Zoom out','←':es?'Velas anteriores':'Earlier candles','→':es?'Velas siguientes':'Later candles'})[label]||label);b.onclick=()=>{action();draw();};tools.append(b);
  }
  const addTool=(id,label)=>{const b=make('button',label);b.type='button';b.setAttribute('data-tool',id);b.setAttribute('aria-pressed','false');b.onclick=()=>setMode(mode===id?null:id);tools.append(b);return b;};
  addTool('h',es?'H. linea':'H. line');addTool('trend',es?'Tendencia':'Trend');addTool('zone',es?'Zona':'Zone');
  const clearButton=make('button',es?'Limpiar':'Clear');clearButton.type='button';clearButton.onclick=()=>{drawings=emptyDrawings();saveDrawings(drawings);setMode(null);draw();};
  tools.append(clearButton);
  for(const [label,get,set] of [['RSI',()=>rsi,v=>{rsi=v;}],['EMA20',()=>ema20,v=>{ema20=v;}],['EMA50',()=>ema50,v=>{ema50=v;}],['VWAP',()=>vwap,v=>{vwap=v;}]]){
    const b=make('button',label);b.type='button';b.setAttribute('aria-pressed',String(get()));
    b.onclick=()=>{set(!get());b.setAttribute('aria-pressed',String(get()));draw();};
    tools.append(b);
  }
  const help=make('small',es?'Rueda o pinza: zoom · arrastra: desplazar · doble clic: restablecer':'Wheel or pinch: zoom · drag: pan · double-click: reset');
  const advanced=make('details');advanced.className='chart-advanced';advanced.append(make('summary',es?'Herramientas del gráfico':'Chart tools'),tools,help);
  parent.append(info,svg,advanced);draw();return true;
}
