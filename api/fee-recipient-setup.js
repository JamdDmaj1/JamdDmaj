import {createFeeRecipientSetupService} from '../lib/fee-recipient-setup-service.js';
import {createFeeRecipientSetupHandler} from '../lib/fee-recipient-setup-http.js';
import {getClientIp,hashIdentifier,redisRequest} from '../lib/server.js';
const ALLOWED=new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getMinimumBalanceForRentExemption','getFeeForMessage','simulateTransaction','isBlockhashValid','sendTransaction','getAccountInfo','getSignatureStatuses','getTransaction']);
async function rpc(method,params){
 if(!ALLOWED.has(method))throw Error('INVALID_SETUP_RPC');
 // Reads can fail over between fixed mainnet providers. A send is attempted
 // exactly once; a transport error is uncertainty, not permission to resend.
 const endpoints=method==='sendTransaction'?['https://solana-rpc.publicnode.com']:['https://solana-rpc.publicnode.com','https://api.mainnet-beta.solana.com'];
 for(const endpoint of endpoints)try{
 const response=await fetch(endpoint,{method:'POST',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
 if(!response.ok||response.redirected)throw Error('SETUP_RPC_UNAVAILABLE');
 const text=await response.text();if(text.length>100000)throw Error('SETUP_RPC_UNAVAILABLE');const value=JSON.parse(text);
 if(value.jsonrpc!=='2.0'||value.id!==1||value.error||!Object.hasOwn(value,'result'))throw Error('SETUP_RPC_UNAVAILABLE');return value.result;
 }catch{}
 throw Error('SETUP_RPC_UNAVAILABLE');
}
async function rateLimit(request){
 const ip=await hashIdentifier(getClientIp(request)),window=Math.floor(Date.now()/60000);
 const result=await redisRequest('pipeline',[['EVAL',"local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],120) end;return n",1,'jamd:fee-setup:'+ip+':'+window]]);
 const count=Number(result[0]?.result);if(!Number.isSafeInteger(count)||count<1)throw Error('LIMIT_UNAVAILABLE');
 if(count>20)throw Object.assign(Error('RATE_LIMIT'),{status:429});
}
const handle=createFeeRecipientSetupHandler({service:createFeeRecipientSetupService({request:rpc}),rateLimit});
export const GET=handle;
export const POST=handle;
