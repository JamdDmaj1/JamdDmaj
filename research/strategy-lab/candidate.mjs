// Local research only: candidate validation.
import {readFileSync, writeFileSync} from "node:fs";
const SYMBOLS=["BTC-USD","ETH-USD","SOL-USD"];
const CAND={lookback:Number(process.env.LOOKBACK||20),targetVol:Number(process.env.TARGET_VOL||0.15),maxLeverage:Number(process.env.MAX_LEV||2),rebalance:Number(process.env.REBALANCE||14)};
const THRESH=Number(process.env.THRESH||0);
const START=Date.UTC(2019,0,1),TRAIN=Date.UTC(2023,0,1),END=Date.UTC(2026,10,17);
const data=Object.fromEntries(SYMBOLS.map(s=>[s,JSON.parse(readFileSync('data/'+s+'.json','utf8'))]));
function stdev(a,i,p){if(i+1<p)return null;const s=a.slice(i-p+1,i+1);const m=s.reduce((x,y)=>x+y,0)/s.length;return Math.sqrt(s.reduce((x,y)=>x+(y-m)**2,0)/s.length)}
function metrics(rows){const n=rows.length;if(!n)return null;let eq=1,peak=1,dd=0;for(const r of rows){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1)}const mean=rows.reduce((a,b)=>a+b,0)/n;const v=rows.reduce((a,b)=>a+(b-mean)**2,0)/n;const vol=Math.sqrt(v)*Math.sqrt(365);const cagr=eq**(365/n)-1;return {days:n,cagr:+(cagr*100).toFixed(2),vol:+(vol*100).toFixed(2),sharpe:+(vol?(mean*365)/vol:0).toFixed(2),maxDrawdown:+(dd*100).toFixed(2),calmar:dd<0?+(cagr/Math.abs(dd)).toFixed(2):null}}
function run(rows,p,cost=0.0005,funding=0.0002){const closes=rows.map(r=>r.close),rets=closes.map((v,i)=>i?v/closes[i-1]-1:0),series=[];let pos=0;for(let i=1;i<rows.length;i++){let desired=pos;if(i%p.rebalance===0||i===1){let sig=0; if(i>=p.lookback){const mom=closes[i-1]/closes[i-1-p.lookback]-1; sig=mom>THRESH?1:mom<-THRESH?-1:0;}const sd=stdev(rets,i-1,20);const lev=sd>0?Math.min(p.maxLeverage,p.targetVol/(sd*Math.sqrt(365))):0;desired=sig*lev}const trade=Math.abs(desired-pos);const net=desired*rets[i]-trade*cost-Math.abs(desired)*funding;pos=desired;series.push({time:rows[i].time,value:net})}return series}
function portfolio(ss){const maps=ss.map(s=>new Map(s.map(x=>[x.time,x.value])));const common=[...maps[0].keys()].filter(t=>maps.every(m=>m.has(t))).sort((a,b)=>a-b);return common.map(t=>({time:t,value:maps.reduce((sum,m)=>sum+m.get(t),0)/maps.length}))}
function pick(s,a,b){return s.filter(x=>x.time>=a&&x.time<b).map(x=>x.value)}
const out={candidate:CAND,assumptions:{cost:0.0005,funding:0.0002},assets:{},years:{},portfolio:{}};
for(const sym of SYMBOLS){const s=run(data[sym],CAND);out.assets[sym]={full:metrics(pick(s,START,END)),train:metrics(pick(s,START,TRAIN)),validation:metrics(pick(s,TRAIN,END))};for(let y=2019;y<=2026;y++){const m=metrics(pick(s,Date.UTC(y,0,1),Date.UTC(y+1,0,1)));if(m)out.years[sym+'_'+y]=m}}
const port=portfolio(SYMBOLS.map(s=>run(data[s],CAND)));out.portfolio={full:metrics(pick(port,START,END)),train:metrics(pick(port,START,TRAIN)),validation:metrics(pick(port,TRAIN,END)),years:{},series:port};for(let y=2019;y<=2026;y++){const m=metrics(pick(port,Date.UTC(y,0,1),Date.UTC(y+1,0,1)));if(m)out.portfolio.years[y]=m}
// cost stress on portfolio
out.stress={};for(const [label,cost,funding] of [["base",0.0005,0.0002],["double",0.001,0.0004],["high",0.001,0.0005]]){const p=portfolio(SYMBOLS.map(s=>run(data[s],CAND,cost,funding)));out.stress[label]={full:metrics(pick(p,START,END)),validation:metrics(pick(p,TRAIN,END))}}
writeFileSync(process.env.OUT||'candidate-results.json',JSON.stringify(out,null,2),'utf8');
console.log(JSON.stringify(out,null,2));
