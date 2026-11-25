// Local research only: long funding history from OKX public API.
import {writeFileSync} from "node:fs";
const SYMBOLS=[["BTCUSDT","BTC-USDT-SWAP"],["ETHUSDT","ETH-USDT-SWAP"],["SOLUSDT","SOL-USDT-SWAP"]];
const out={generatedAt:new Date().toISOString(),symbols:{}};
for(const [name,instId] of SYMBOLS){
 const rows=[]; const seen=new Set(); let before=0;
 for(let page=0;page<90;page+=1){
  const url=`https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${before?`&before=${Math.floor(before/1000)}`:""}`;
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const b=await r.json();
  const list=Array.isArray(b.data)?b.data:[];
  if(!list.length)break;
  for(const item of list){const rate=Number(item.realizedRate??item.fundingRate);const time=Number(item.fundingTime);if(Number.isFinite(rate)&&Number.isFinite(time)&&!seen.has(time)){seen.add(time);rows.push({time,rate});}}
  const oldest=Math.min(...list.map(x=>Number(x.fundingTime)));
  if(!Number.isFinite(oldest)||(before&&oldest>=before))break;
  const beforeCount=rows.length;
  before=oldest;
  if(oldest<Date.UTC(2020,0,1))break;
  await new Promise(r=>setTimeout(r,80));
 }
 rows.sort((a,b)=>a.time-b.time);
 const uniq=[...new Map(rows.map(x=>[x.time,x])).values()];
 const rates=uniq.map(x=>x.rate);
 const mean=rates.reduce((a,b)=>a+b,0)/rates.length;
 const variance=rates.reduce((a,b)=>a+(b-mean)**2,0)/rates.length;
 const sd=Math.sqrt(variance);
 const periodsPerYear=3*365;
 const annual=mean*periodsPerYear*100;
 const vol=sd*Math.sqrt(periodsPerYear)*100;
 const sharpe=vol?annual/vol:0;
 let eq=1,peak=1,dd=0;for(const r of rates){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1);}
 out.symbols[name]={samples:rates.length,from:new Date(uniq[0]?.time||0).toISOString(),to:new Date(uniq.at(-1)?.time||0).toISOString(),meanFundingPct:+(mean*100).toFixed(4),annualizedPct:+annual.toFixed(2),annualizedVolPct:+vol.toFixed(2),sharpe:+sharpe.toFixed(2),maxDrawdownPct:+(dd*100).toFixed(2)};
}
writeFileSync("carry-long-results.json",JSON.stringify(out,null,2),"utf8");console.log(JSON.stringify(out,null,2));
