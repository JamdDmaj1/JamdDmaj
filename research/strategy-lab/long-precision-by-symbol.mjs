// Local research only: long precision by symbol.
import {readFileSync, writeFileSync} from "node:fs";
const S=["BTC-USD","ETH-USD","SOL-USD"],H=30,SPLIT=Date.UTC(2023,0,1);const data=Object.fromEntries(S.map(s=>[s,JSON.parse(readFileSync("data/"+s+".json","utf8"))]));
function atr(rows,i,p=14){const t=[];for(let j=Math.max(1,i-p+1);j<=i;j++){const prev=rows[j-1].close;t.push(Math.max(rows[j].high-rows[j].low,Math.abs(rows[j].high-prev),Math.abs(rows[j].low-prev)))}return t.reduce((a,b)=>a+b,0)/t.length}
function out(rows,i,e,a){const tp=e+a*2,sl=e-a*5;for(let j=i+1;j<=i+H;j++){const r=rows[j];if(r.low<=sl)return {ret:-5*a/e-0.001,hit:false};if(r.high>=tp)return {ret:2*a/e-0.001,hit:true}}const last=rows[i+H].close;return {ret:(last/e-1)-0.001,hit:last>e}}
function stats(arr){if(!arr.length)return null;const r=arr;return {n:r.length,hit:+(r.filter(x=>x.hit).length/r.length*100).toFixed(1),avg:+(r.reduce((a,x)=>a+x.ret,0)/r.length*100).toFixed(2)}}
const outObj={};for(const s of S){const rows=data[s],all=[],val=[];for(let i=30;i<rows.length-H;i++){const mom=rows[i].close/rows[i-7].close-1;if(mom<=0.05)continue;const x=out(rows,i,rows[i].close,atr(rows,i));all.push(x);if(rows[i].time>=SPLIT)val.push(x)}outObj[s]={all:stats(all),val:stats(val)}}writeFileSync("long-precision-by-symbol.json",JSON.stringify(outObj,null,2),"utf8");console.log(JSON.stringify(outObj,null,2));
