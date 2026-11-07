// Operator-side read/simulation diagnostic. No custody, key or send imports.
import {readFileSync,lstatSync} from 'node:fs';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {readPerpsMarketReference} from '../lib/perps-market-reference.js';
import {prepareInspectedPerpsManualOrder} from '../lib/perps-manual-preparation.js';
import {prepareProtectedPerpsEntryConversion} from '../lib/perps-entry-conversion-preparation.js';
const pid=process.argv[2],asset=process.argv[3],side=process.argv[4];
if(!/^[1-9][0-9]*$/.test(pid)||!['BTC','ETH','SOL'].includes(asset)||!['LONG','SHORT'].includes(side))throw Error('INVALID_READ_ONLY_CHECK');
const env=readFileSync('/proc/'+pid+'/environ','utf8').split('\0');
const url=env.find(v=>v.startsWith('JAMDDMAJ_PERPS_RPC_URL='))?.slice('JAMDDMAJ_PERPS_RPC_URL='.length);
const alternate=process.argv[5];
if(alternate!==undefined&&!['--publicnode-read-only','--helius-read-only','--configured-read-only'].includes(alternate))throw Error('INVALID_READ_ONLY_CHECK');
const conversion=process.argv[6];
if(conversion!==undefined&&(conversion!=='--protected-conversion'||side!=='LONG')||process.argv.length>7)throw Error('INVALID_READ_ONLY_CHECK');
let selectedUrl=url||'https://api.mainnet-beta.solana.com';
if(alternate==='--publicnode-read-only')selectedUrl='https://solana-rpc.publicnode.com';
if(alternate==='--helius-read-only'){
 const path='/root/jamddmaj-helius-rpc-20261107.input',stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o777)!==0o600||stat.size>2048)throw Error('INVALID_PRIVATE_RPC_FILE');
 selectedUrl=readFileSync(path,'utf8').replace(/^\uFEFF/,'').trim();
 let valid=false;try{const u=new URL(selectedUrl);valid=u.protocol==='https:'&&u.hostname==='mainnet.helius-rpc.com'&&u.pathname==='/'&&!u.username&&!u.password&&!u.hash&&/^[a-zA-Z0-9_-]{20,200}$/.test(u.searchParams.get('api-key')||'')&&[...u.searchParams.keys()].every(k=>k==='api-key');}catch{}
 if(!valid)throw Error('INVALID_PRIVATE_RPC_FILE');
}
let lastRead=null,httpStatus=null,rpcErrorCode=null;
const started=performance.now(),counts={};
const read=createServerPerpsReadOnlyRpc({url:selectedUrl,fetchImpl:async(endpoint,options)=>{
 const method=JSON.parse(options.body).method;counts[method]=(counts[method]??0)+1;
 const response=await fetch(endpoint,options);httpStatus=response.status;
 if(response.headers.get('content-type')?.includes('application/json')){try{const parsed=await response.clone().json();rpcErrorCode=Number.isInteger(parsed?.error?.code)?parsed.error.code:null;}catch{}}
 return response;
}});
const rpcRequest=(method,params)=>{lastRead=method;return read(method,params);};
try{
 const referencePrice=await readPerpsMarketReference(asset);
 if(conversion){
  const result=await prepareProtectedPerpsEntryConversion({asset,side,margin:'10',leverage:'3',referencePrice},'3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',{request:rpcRequest});
  console.log(JSON.stringify({stage:result.stage,asset,side,ok:true,submitted:false,readyForSigning:result.readyForSigning,elapsedMs:Math.round(performance.now()-started),counts}));
 }else{
 const result=await prepareInspectedPerpsManualOrder({asset,side,margin:'10',leverage:'3',referencePrice},'3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',{
  rpcRequest,builderRequest:(endpoint,options)=>{
   const u=new URL(endpoint);if(u.origin!=='https://perps-api.jup.ag'||u.pathname.includes('execute'))throw Error('FORBIDDEN_DIAGNOSTIC_TRANSPORT');
   return fetch(endpoint,options);
  }});
 console.log(JSON.stringify({stage:'MANUAL_UNSIGNED_PROVIDER_CHECK',asset,side,ok:true,readyForSigning:result.readyForSigning,submitted:false,alternate:!!alternate,elapsedMs:Math.round(performance.now()-started),counts}));
 }
}catch(error){console.log(JSON.stringify({stage:'MANUAL_UNSIGNED_PROVIDER_CHECK',asset,side,ok:false,code:/^[A-Z_]{1,120}$/.test(error.message)?error.message:'READ_ONLY_CHECK_UNAVAILABLE',lastRead,httpStatus,rpcErrorCode,submitted:false}));process.exitCode=1;}
