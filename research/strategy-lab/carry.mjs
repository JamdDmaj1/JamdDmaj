// Local research only: Bitget funding history carry estimate.
import {writeFileSync} from "node:fs";
const SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT"];
const out={generatedAt:new Date().toISOString(),symbols:{}};
for(const symbol of SYMBOLS){
 const rows=[];
 for(let page=1;page<=12;page+=1){
  const url=`https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=USDT-FUTURES&pageSize=100&pageNo=${page}`;
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const b=await r.json();
  if(!Array.isArray(b.data)||!b.data.length)break;
  for(const item of b.data){const rate=Number(item.fundingRate);const time=Number(item.fundingTime);if(Number.isFinite(rate)&&Number.isFinite(time))rows.push({time,rate});}
 }
 rows.sort((a,b)=>a.time-b.time);
 const rates=rows.map(x=>x.rate);
 const mean=rates.reduce((a,b)=>a+b,0)/rates.length;
 const variance=rates.reduce((a,b)=>a+(b-mean)**2,0)/rates.length;
 const sd=Math.sqrt(variance);
 const periodsPerYear=3*365;
 const annual=mean*periodsPerYear*100;
 const vol=sd*Math.sqrt(periodsPerYear)*100;
 const sharpe=vol?annual/vol:0;
 let eq=1,peak=1,dd=0;for(const r of rates){eq*=1+r;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1);}
 out.symbols[symbol]={samples:rates.length,from:new Date(rows[0]?.time||0).toISOString(),to:new Date(rows.at(-1)?.time||0).toISOString(),meanFundingPct:+(mean*100).toFixed(4),annualizedPct:+annual.toFixed(2),annualizedVolPct:+vol.toFixed(2),sharpe:+sharpe.toFixed(2),maxDrawdownPct:+(dd*100).toFixed(2)};
}
writeFileSync("carry-results.json",JSON.stringify(out,null,2),"utf8");
console.log(JSON.stringify(out,null,2));
