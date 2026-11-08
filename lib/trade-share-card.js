import {validClosedTradePerformance,formatTradeUnits,formatTradePercent} from './closed-trade-performance.js';
export const defaultTradeShareOptions=Object.freeze({amount:false,percentage:true,margin:false,date:false,theme:'dark',shape:'wide'});
export function tradeShareModel(item,options={},language='es'){
 const o={...defaultTradeShareOptions,...options},t=(es,en)=>language==='es'?es:en;
 const p=validClosedTradePerformance(item.performance,item.receivedUsdcUnits,item.state)?item.performance:null;
 const visible=p&&(o.amount||o.percentage),sign=visible?BigInt(p.resultUsdcUnits):0n;
 const numeric=[];if(p&&o.percentage)numeric.push({kind:'percentage',text:formatTradePercent(p.returnBps,language)});
 if(p&&o.amount)numeric.push({kind:'amount',text:formatTradeUnits(p.resultUsdcUnits,{signedValue:true,language,digits:BigInt(p.resultUsdcUnits)!==0n&&BigInt(p.resultUsdcUnits)>-10000n&&BigInt(p.resultUsdcUnits)<10000n?6:2})+' USDC'});
 return Object.freeze({asset:['BTC','ETH','SOL'].includes(item.asset)?item.asset:'TOKEN',side:['LONG','SHORT'].includes(item.side)?item.side:'',tone:sign>0n?'positive':sign<0n?'negative':'neutral',numeric,
  title:p?(visible?(sign>0n?t('OPERACIÓN EN GANANCIA','PROFITABLE TRADE'):sign<0n?t('OPERACIÓN EN PÉRDIDA','LOSING TRADE'):t('RESULTADO SIN CAMBIO','UNCHANGED RESULT')):t('OPERACIÓN CERRADA','CLOSED TRADE')):t('RESULTADO NO DISPONIBLE','RESULT UNAVAILABLE'),
  margin:p&&o.margin?t('Margen aportado: ','Contributed margin: ')+formatTradeUnits(p.basisUsdcUnits,{language})+' USDC':null,
  date:o.date?new Date(item.closedAt).toLocaleString(language==='es'?'es':'en'):null,
  disclosure:p?t('Resultado sobre margen registrado, con comisión de apertura.','Return on recorded margin, including opening platform fee.'):t('No hay datos suficientes para calcular el resultado.','Insufficient data to calculate the result.'),
  exclusion:t('No incluye costes de red ni rentas en SOL.','Excludes SOL network costs and account rent.'),width:o.shape==='square'?1080:1200,height:o.shape==='square'?1080:675,theme:o.theme==='light'?'light':'dark'});
}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
export function drawTradeShareCard(canvas,item,options,language='es'){
 const m=tradeShareModel(item,options,language);canvas.width=m.width;canvas.height=m.height;
 const c=canvas.getContext('2d');if(!c)throw Error('PNG_CANVAS_UNAVAILABLE');
 const light=m.theme==='light',ink=light?'#0d2238':'#f1f7ff',muted=light?'#466075':'#9db4ca',accent=m.tone==='positive'?(light?'#087b54':'#51e5ad'):m.tone==='negative'?(light?'#bc284c':'#ff819c'):(light?'#087a96':'#62d9ef');
 const g=c.createLinearGradient(0,0,m.width,m.height);g.addColorStop(0,light?'#f4f9ff':'#081422');g.addColorStop(1,light?'#dbe8f2':'#182442');c.fillStyle=g;c.fillRect(0,0,m.width,m.height);
 c.globalAlpha=.08;c.fillStyle=accent;c.beginPath();c.arc(m.width-80,60,380,0,Math.PI*2);c.fill();c.globalAlpha=1;c.strokeStyle=light?'#b9cedd':'#31485f';c.lineWidth=2;roundRect(c,24,24,m.width-48,m.height-48,28);c.stroke();
 function text(value,x,y,size,color=ink,weight='600',max=m.width-112){c.fillStyle=color;c.font=weight+' '+size+'px system-ui, sans-serif';while(c.measureText(value).width>max&&size>18){size--;c.font=weight+' '+size+'px system-ui, sans-serif';}c.fillText(value,x,y);}
 text('JamdDmaj',58,86,31,accent,'800');text('TRADE JOURNAL',58,115,14,muted,'600');
 const top=m.height>700?240:180;text(m.asset+' / USDC',58,top,52,ink,'800');text(m.side,58,top+45,24,accent,'700');text(m.title,58,top+99,18,muted,'700');let y=top+180;
 if(m.numeric.length){for(let i=0;i<m.numeric.length;i++){text(m.numeric[i].text,58,y,i===0?82:38,accent,'800');y+=i===0?63:52;}}
 else{text(language==='es'?'CIERRE REGISTRADO':'RECORDED CLOSE',58,y,38,ink,'700');y+=58;}
 if(m.margin){text(m.margin,58,y+8,20,muted);y+=38;}if(m.date)text(m.date,58,Math.min(y+24,m.height-150),18,muted,'500');
 text(m.disclosure,58,m.height-104,16,muted,'500');text(m.exclusion,58,m.height-77,16,muted,'500');text('jamddmaj.com',58,m.height-43,17,accent,'700');return m;
}
