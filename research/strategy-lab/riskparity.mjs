// Local research only: equal weight vs inverse-vol risk parity.
import {readFileSync, writeFileSync} from "node:fs";
const SYMBOLS=["BTC-USD","ETH-USD","SOL-USD"];
const START=Date.UTC(2019,0,1),TRAIN=Date.UTC(2023,0,1),END=Date.UTC(2026,10,17);
const THRESH=0.005,CAND={lookback:20,targetVol:0.15,maxLeverage:2,rebalance:14};
const data=Object.fromEntries(SYMBOLS.map(s=>[s,JSON.parse(readFileSync('data/'+s+'.json','utf8'))]));
function stdev(a,i,p){if(i+1<p)return null;const s=a.slice(i-p+1,i+1);const m=s.reduce((x,y)=>x+y,0)/s.length;return Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/s.length)}
function metrics(rows){const n=rows.length;if(!n)return null;let eq=1,peak=1,dd=0;for(const r of rows){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1)}const mean=rows.reduce((a,b)=>a+b,0)/n;const v=rows.reduce((a,b)=>a+(b-mean)**2,0)/n;const vol=Math.sqrt(v)*Math.sqrt(365);const cagr=eq**(365/n)-1;return {cagr:+(cagr*100).toFixed(2),vol:+(vol*100).toFixed(2),sharpe:+(vol?(mean*365)/vol:0).toFixed(2),maxDrawdown:+(dd*100).toFixed(2),calmar:dd<0?+(cagr/Math.abs(dd)).toFixed(2):null}}
function run(rows){const closes=rows.map(r=>r.close),rets=closes.map((v,i)=>i?v/closes[i-1]-1:0),series=[];let pos=0;for(let i=1;i<rows.length;i++){let desired=pos;if(i%CAND.rebalance===0||i===1){let sig=0;if(i>=CAND.lookback){const mom=closes[i-1]/closes[i-1-CAND.lookback]-1;sig=mom>THRESH?1:mom<-THRESH?-1:0}const sd=stdev(rets,i-1,20);const lev=sd>0?Math.min(CAND.maxLeverage,CAND.targetVol/(sd*Math.sqrt(365))):0;desired=sig*lev}const trade=Math.abs(desired-pos);series.push({time:rows[i].time,value:desired*rets[i]-trade*0.0005-Math.abs(desired)*0.0002});pos=desired}return {series,rets,closes}}
function pick(s,a,b){return s.filter(x=>x.time>=a&&x.time<b).map(x=>x.value)}
const runs=Object.fromEntries(SYMBOLS.map(s=>[s,run(data[s])]));
const times=runs['BTC-USD'].series.map(x=>x.time);
const maps=Object.fromEntries(SYMBOLS.map(s=>[s,new Map(runs[s].series.map(x=>[x.time,x.value]))]));
const priceMaps=Object.fromEntries(SYMBOLS.map(s=>[s,new Map(data[s].map(x=>[x.time,x.close]))]));
const eq=[],rp=[];let weights=SYMBOLS.map(()=>1/3);
for(let i=0;i<times.length;i++){const t=times[i];if(i%14===0&&i>40){const inv=SYMBOLS.map(s=>{const closes=[...priceMaps[s].values()].filter(x=>x<=t);const rets=closes.slice(-21).map((v,j,a)=>j?v/a[j-1]-1:0).slice(1);const sd=stdev(rets,rets.length-1,Math.min(20,rets.length));return sd>0?1/sd:0});const sum=inv.reduce((a,b)=>a+b,0);weights=sum?inv.map(x=>x/sum):SYMBOLS.map(()=>1/3)}const vals=SYMBOLS.map(s=>maps[s].get(t)||0);eq.push({time:t,value:vals.reduce((a,b)=>a+b,0)/3});rp.push({time:t,value:vals.reduce((a,b,j)=>a+b*weights[j],0)})}
const out={equal:{train:metrics(pick(eq,START,TRAIN)),validation:metrics(pick(eq,TRAIN,END)),full:metrics(pick(eq,START,END))},riskParity:{train:metrics(pick(rp,START,TRAIN)),validation:metrics(pick(rp,TRAIN,END)),full:metrics(pick(rp,START,END))}};writeFileSync('riskparity-results.json',JSON.stringify(out,null,2),'utf8');console.log(JSON.stringify(out,null,2));
