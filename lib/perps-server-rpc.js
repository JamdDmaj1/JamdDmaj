// Bounded read-only Solana transport for the Perps executor's validation path.
// There is deliberately no sendTransaction, signing, wallet or builder method.
const METHODS=new Set(['getGenesisHash','getSlot','getBlockHeight','getLatestBlockhash','isBlockhashValid','getMultipleAccounts','getFeeForMessage','simulateTransaction','getMinimumBalanceForRentExemption','getSignatureStatuses','getTransaction','getTokenAccountsByOwner','getProgramAccounts','getSignaturesForAddress','getFirstAvailableBlock','getBlocks','getBlockTime']);
const DEFAULT_RPC='https://api.mainnet-beta.solana.com';
function fail(){throw Error('PERPS_READ_ONLY_RPC_UNAVAILABLE');}
export function createServerPerpsReadOnlyRpc({url=DEFAULT_RPC,fetchImpl=globalThis.fetch,timeoutMs=8000,maxResponseBytes=4194304,readSpacingMs}={}){
 let endpoint;try{endpoint=new URL(url);}catch{fail();}
 const loopbackProxy=endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname)&&endpoint.port==='8899'&&process.env.JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY==='true';
 if((endpoint.protocol!=='https:'&&!loopbackProxy)||endpoint.username||endpoint.password||endpoint.hash||typeof fetchImpl!=='function'
  ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1024||maxResponseBytes>8388608)fail();
 // Helius Free permits ten RPC reads per second. Space starts (including
 // concurrent history reads), with headroom. No caching, retries or sends.
 const spacing=readSpacingMs??(endpoint.hostname==='mainnet.helius-rpc.com'?125:0);
 if(!Number.isSafeInteger(spacing)||spacing<0||spacing>250)fail();
 const target=endpoint.href;let sequence=0,nextStart=0,waiting=0;
 return async function request(method,params){
  if(!METHODS.has(method)||!Array.isArray(params)||params.length>10)fail();
  const requestId=++sequence;
  let encoded;try{encoded=JSON.stringify({jsonrpc:'2.0',id:requestId,method,params});}catch{fail();}
  if(sequence>Number.MAX_SAFE_INTEGER||Buffer.byteLength(encoded)>32768)fail();
  if(spacing){
   if(waiting>=32)throw Error('PERPS_READ_ONLY_RPC_RATE_LIMITED');
   const now=performance.now(),start=Math.max(now,nextStart),delay=start-now;
   // Never turn a fresh read into an unbounded queue. Upstream evidence
   // clocks still include this wait and independently refuse stale reviews.
   if(delay>4000)throw Error('PERPS_READ_ONLY_RPC_RATE_LIMITED');
   nextStart=start+spacing;waiting++;
   try{if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));}finally{waiting--;}
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let reader,limited=false;
  try{
   const response=await fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json','Accept':'application/json'},body:encoded,signal:controller.signal});
   if(response?.status===429){limited=true;fail();}
   if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>maxResponseBytes))fail();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maxResponseBytes)fail();parts.push(Buffer.from(chunk.value));}
   if(controller.signal.aborted)fail();
   const value=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(value?.jsonrpc==='2.0'&&value.id===requestId&&value.error?.code===429){limited=true;fail();}
   if(!value||Array.isArray(value)||value.jsonrpc!=='2.0'||value.id!==requestId||Object.hasOwn(value,'error')||!Object.hasOwn(value,'result'))fail();
   return value.result;
  }catch{if(limited)throw Error('PERPS_READ_ONLY_RPC_RATE_LIMITED');fail();}
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 };
}
