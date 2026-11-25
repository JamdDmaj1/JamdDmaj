// Local research only: threshold and risk-parity tests around the candidate.
import {readFileSync, writeFileSync} from "node:fs";
const SYMBOLS=["BTC-USD","ETH-USD","SOL-USD"];
const START=Date.UTC(2019,0,1),TRAIN=Date.UTC(2023,0,1),END=Date.UTC(2026,10,17);
const data=Object.fromEntries(SYMBOLS.map(s=>[s,JSON.parse(readFileSync('data/'+s+'.json','utf8'))]));
function stdev(a,i,p){if(i+1<p)return null;const s=a.slice(i-p+1,i+1);const m=s.reduce((x,y)=>x+y,0)/s.length;return Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/s.length)}
function metrics(rows){const n=rows.length;if(!n)return null;let eq=1,peak=1,dd=0;for(const r of rows){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1)}const mean=rows.reduce((a,b)=>a+b,0)/n;const v=rows.reduce((a,b)=>a+(b-mean)**2,0)/n;const vol=Math.sqrt(v)*Math.sqrt(365);const cagr=eq**(365/n)-1;return {cagr:+(cagr*100).toFixed(2),vol:+(vol*100).toFixed(2),sharpe:+(vol?(mean*365)/vol:0).toFixed(2),maxDrawdown:+(dd*100).toFixed(2),calmar:dd<0?+(cagr/Math.abs(dd)).toFixed(2):null}}
function run(rows,p,threshold){const closes=rows.map(r=>r.close),rets=closes.map((v,i)=>i?v/closes[i-1]-1:0),series=[];let pos=0;for(let i=1;i<rows.length;i++){let desired=pos;if(i%p.rebalance===0||i===1){let sig=0;if(i>=p.lookback){const mom=closes[i-1]/closes[i-1-p.lookback]-1;sig=mom>threshold?1:mom<-threshold?-1:0}const sd=stdev(rets,i-1,20);const lev=sd>0?Math.min(p.maxLeverage,p.targetVol/(sd*Math.sqrt(365))):0;desired=sig*lev}const trade=Math.abs(desired-pos);const net=desired*rets[i]-trade*0.0005-Math.abs(desired)*0.0002;pos=desired;series.push({time:rows[i].time,value:net})}return series}
function portfolio(ss){const maps=ss.map(s=>new Map(s.map(x=>[x.time,x.value])));const common=[...maps[0].keys()].filter(t=>maps.every(m=>m.has(t))).sort((a,b)=>a-b);return common.map(t=>({time:t,value:maps.reduce((sum,m)=>sum+m.get(t),0)/maps.length}))}
function pick(s,a,b){return s.filter(x=>x.time>=a&&x.time<b).map(x=>x.value)}
const base={lookback:20,targetVol:0.15,maxLeverage:2,rebalance:14};
const out={thresholds:{},riskParity:{}};
for(const th of [0,0.005,0.01,0.02,0.03,0.05,0.08,0.1]){const s=portfolio(SYMBOLS.map(x=>run(data[x],base,th)));out.thresholds[th]={train:metrics(pick(s,START,TRAIN)),validation:metrics(pick(s,TRAIN,END)),full:metrics(pick(s,START,END)),year2022:metrics(pick(s,Date.UTC(2022,0,1),Date.UTC(2023,0,1))),year2026:metrics(pick(s,Date.UTC(2026,0,1),Date.UTC(2026,10,17)))}}
writeFileSync('threshold-results.json',JSON.stringify(out,null,2),'utf8');for(const [k,v] of Object.entries(out.thresholds))console.log('th',k,'train',v.train.sharpe,'val',v.validation.sharpe,'cagr',v.validation.cagr,'dd',v.validation.maxDrawdown,'2022',v.year2022.cagr,'2026',v.year2026.cagr)
