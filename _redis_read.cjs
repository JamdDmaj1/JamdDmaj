const fs=require('fs');const m={};for(const line of fs.readFileSync('.env.audit','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)m[line.slice(0,i)]=line.slice(i+1).trim();}
const url=m.UPSTASH_REDIS_REST_URL, token=m.UPSTASH_REDIS_REST_TOKEN;
if(!url||!token){console.log('NO_REDIS');process.exit(1)}
(async()=>{const r=await fetch(url+'/get/jamd:pro:server:open',{headers:{Authorization:'Bearer '+token}});console.log(r.status);const j=await r.json();let arr=[];try{arr=JSON.parse(j.result||'[]')}catch{};console.log('type',typeof arr,Array.isArray(arr),arr.length);if(Array.isArray(arr))console.log(arr.map(s=>({pair:s.pair,status:s.status,score:s.score,createdAt:s.createdAt,telegramSentAt:s.telegramSentAt})));})().catch(e=>{console.error(e.message);process.exit(1)});
