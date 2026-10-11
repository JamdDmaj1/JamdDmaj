// Public OHLC only. This renderer never reads wallet data or submits orders.
export function validCandles(rows) {
  return [...new Map((Array.isArray(rows)?rows:[]).filter(c=>
    ['time','open','high','low','close'].every(k=>Number.isFinite(c[k])&&c[k]>0)&&
    c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)
  ).map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time).slice(-120);
}
export function setupCandleChart(parent,raw,language,doc){
  const rows=validCandles(raw),es=language==='es';if(rows.length<2)return false;
  const make=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const tools=make('div');tools.className='terminal-shortcuts';
  const info=make('p');info.setAttribute('role','status');
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 720 360');svg.setAttribute('role','img');svg.setAttribute('aria-label',es?'Velas OHLC y volumen':'OHLC candles and volume');
  let count=60,offset=0,ma=true;
  const element=(tag,attrs,text)=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
  const describe=c=>{info.textContent=new Date(c.time).toLocaleString(language)+` · O ${c.open} H ${c.high} L ${c.low} C ${c.close} · `+(Number.isFinite(c.volume)&&c.volume>=0?'Vol '+c.volume:(es?'Volumen no disponible':'Volume unavailable'));};
  function draw(){
    svg.replaceChildren();offset=Math.max(0,Math.min(offset,rows.length-2));const end=rows.length-offset,start=Math.max(0,end-count),visible=rows.slice(start,end);
    const low=Math.min(...visible.map(c=>c.low)),high=Math.max(...visible.map(c=>c.high)),span=high-low||high*.01;
    const y=v=>260-(v-low)/span*230,step=620/visible.length,maxVol=Math.max(1,...visible.map(c=>Number.isFinite(c.volume)?c.volume:0));
    for(let i=0;i<=4;i++){const value=low+span*i/4,yy=y(value);element('line',{x1:10,x2:635,y1:yy,y2:yy,stroke:'#263750'});element('text',{x:640,y:yy+4,fill:'#9badc5','font-size':11},value.toLocaleString(language,{maximumSignificantDigits:6}));}
    visible.forEach((c,i)=>{
      const x=10+(i+.5)*step,color=c.close>=c.open?'#20c79b':'#ff5262';
      element('line',{x1:x,x2:x,y1:y(c.high),y2:y(c.low),stroke:color});
      const body=element('rect',{x:x-step*.32,y:Math.min(y(c.open),y(c.close)),width:Math.max(1,step*.64),height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color,tabindex:0,role:'img','aria-label':new Date(c.time).toLocaleString(language)+` O ${c.open} H ${c.high} L ${c.low} C ${c.close}`});
      body.onpointerenter=body.onfocus=()=>describe(c);
      if(Number.isFinite(c.volume)&&c.volume>=0)element('rect',{x:x-step*.32,y:330-c.volume/maxVol*45,width:Math.max(1,step*.64),height:c.volume/maxVol*45,fill:color,opacity:.5});
    });
    if(ma){const points=[];for(let i=start;i<end;i++){if(i<19)continue;const average=rows.slice(i-19,i+1).reduce((sum,c)=>sum+c.close,0)/20;if(average>=low&&average<=high)points.push(`${10+(i-start+.5)*step},${y(average)}`);}element('polyline',{points:points.join(' '),fill:'none',stroke:'#cf9dff','stroke-width':1.5});}
    for(const i of [0,Math.floor((visible.length-1)/2),visible.length-1])element('text',{x:10+i*step,y:352,fill:'#9badc5','font-size':10},new Date(visible[i].time).toLocaleDateString(language));
    describe(visible.at(-1));
  }
  for(const[label,action]of [['+',()=>{count=Math.max(10,count-15);}],['−',()=>{count=Math.min(120,count+15);}],['←',()=>{offset=Math.min(rows.length-2,offset+15);}],['→',()=>{offset=Math.max(0,offset-15);}],['SMA20',()=>{ma=!ma;}],[es?'Restablecer':'Reset',()=>{count=60;offset=0;ma=true;}]]){
    const b=make('button',label);b.type='button';b.setAttribute('aria-label',({'+' : es?'Acercar':'Zoom in','−':es?'Alejar':'Zoom out','←':es?'Velas anteriores':'Earlier candles','→':es?'Velas siguientes':'Later candles'})[label]||label);b.onclick=()=>{action();draw();};tools.append(b);
  }
  parent.append(tools,info,svg);draw();return true;
}
