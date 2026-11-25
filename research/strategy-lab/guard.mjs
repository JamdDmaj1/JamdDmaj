// Local research only: portfolio drawdown guard on the candidate.
import {readFileSync, writeFileSync} from "node:fs";
const d=JSON.parse(readFileSync('candidate-th005.json','utf8'));const series=d.portfolio.series;
function metrics(rows){const n=rows.length;if(!n)return null;let eq=1,peak=1,dd=0;for(const r of rows){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1)}const mean=rows.reduce((a,b)=>a+b,0)/n;const v=rows.reduce((a,b)=>a+(b-mean)**2,0)/n;const vol=Math.sqrt(v)*Math.sqrt(365);const cagr=eq**(365/n)-1;return {cagr:+(cagr*100).toFixed(2),vol:+(vol*100).toFixed(2),sharpe:+(vol?(mean*365)/vol:0).toFixed(2),dd:+(dd*100).toFixed(2),calmar:dd<0?+(cagr/Math.abs(dd)).toFixed(2):null}}
const START=Date.UTC(2019,0,1),TRAIN=Date.UTC(2023,0,1),END=Date.UTC(2026,10,17);
function guard(threshold,mult){let eq=1,peak=1,dd=0,active=false;const out=[];for(const row of series){const r=row.value*(active?mult:1);eq*=1+r;peak=Math.max(peak,eq);dd=eq/peak-1;if(dd<=-threshold)active=true;else if(dd>=-threshold/2&&active)active=false;out.push({time:row.time,value:r})}return out}
const pick=(s,a,b)=>s.filter(x=>x.time>=a&&x.time<b).map(x=>x.value);
const out={};for(const th of [0.08,0.1,0.12,0.15,0.18,0.2])for(const m of [0,0.25,0.5,0.75]){const s=guard(th,m);out[th+'_'+m]={train:metrics(pick(s,START,TRAIN)),validation:metrics(pick(s,TRAIN,END)),full:metrics(pick(s,START,END))}}
writeFileSync('guard-results.json',JSON.stringify(out,null,2),'utf8');const rows=Object.entries(out).map(([k,v])=>({k,...v.validation,...v.full})).sort((a,b)=>b.sharpe-a.sharpe);console.log('TOP VALIDATION');for(const r of rows.slice(0,12))console.log(r.k,'val',r.sharpe,r.cagr,'dd',r.dd,'full',r.full.sharpe,r.full.cagr,'fulldd',r.full.dd)
