// Operator-side read/simulation diagnostic. No custody, key or send imports.
import {readFileSync} from 'node:fs';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {readPerpsMarketReference} from '../lib/perps-market-reference.js';
import {prepareInspectedPerpsManualOrder} from '../lib/perps-manual-preparation.js';
const pid=process.argv[2],asset=process.argv[3],side=process.argv[4];
if(!/^[1-9][0-9]*$/.test(pid)||!['BTC','ETH','SOL'].includes(asset)||!['LONG','SHORT'].includes(side))throw Error('INVALID_READ_ONLY_CHECK');
const env=readFileSync('/proc/'+pid+'/environ','utf8').split('\0');
const url=env.find(v=>v.startsWith('JAMDDMAJ_PERPS_RPC_URL='))?.slice('JAMDDMAJ_PERPS_RPC_URL='.length);
let lastRead=null,httpStatus=null,rpcErrorCode=null;
const read=createServerPerpsReadOnlyRpc({url:url||'https://api.mainnet-beta.solana.com',fetchImpl:async(endpoint,options)=>{
 const response=await fetch(endpoint,options);httpStatus=response.status;
 if(response.headers.get('content-type')?.includes('application/json')){try{const parsed=await response.clone().json();rpcErrorCode=Number.isInteger(parsed?.error?.code)?parsed.error.code:null;}catch{}}
 return response;
}});
const rpcRequest=(method,params)=>{lastRead=method;return read(method,params);};
try{
 const referencePrice=await readPerpsMarketReference(asset);
 const result=await prepareInspectedPerpsManualOrder({asset,side,margin:'10',leverage:'3',referencePrice},'3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',{
  rpcRequest,builderRequest:(endpoint,options)=>{
   const u=new URL(endpoint);if(u.origin!=='https://perps-api.jup.ag'||u.pathname.includes('execute'))throw Error('FORBIDDEN_DIAGNOSTIC_TRANSPORT');
   return fetch(endpoint,options);
  }});
 console.log(JSON.stringify({stage:'MANUAL_UNSIGNED_PROVIDER_CHECK',asset,side,ok:true,readyForSigning:result.readyForSigning,submitted:false}));
}catch(error){console.log(JSON.stringify({stage:'MANUAL_UNSIGNED_PROVIDER_CHECK',asset,side,ok:false,code:/^[A-Z_]{1,120}$/.test(error.message)?error.message:'READ_ONLY_CHECK_UNAVAILABLE',lastRead,httpStatus,rpcErrorCode,submitted:false}));process.exitCode=1;}
