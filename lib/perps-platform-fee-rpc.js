// Private worker transport, never an HTTP relay. Reads use the existing bounded
// reader; only a verified fee collector may call its one-attempt send branch.
export function createPerpsPlatformFeeRpc({readRequest,fetchImpl=globalThis.fetch}={}){
 if(typeof readRequest!=='function'||typeof fetchImpl!=='function')throw Error('PLATFORM_FEE_RPC_UNAVAILABLE');
 return async(method,params)=>{
  if(method!=='sendTransaction')return readRequest(method,params);
  if(!Array.isArray(params)||params.length!==2||typeof params[0]!=='string'||params[0].length>1650
    ||JSON.stringify(params[1])!==JSON.stringify({encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}))throw Error('PLATFORM_FEE_RPC_UNAVAILABLE');
  // No fallback or automatic resend, including on a lost response.
  const response=await fetchImpl('https://api.mainnet-beta.solana.com',{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});
  if(!response.ok||response.redirected)throw Error('PLATFORM_FEE_RPC_UNAVAILABLE');
  const body=await response.text();if(body.length>8192)throw Error('PLATFORM_FEE_RPC_UNAVAILABLE');const result=JSON.parse(body);
  if(result.jsonrpc!=='2.0'||result.id!==1||result.error||typeof result.result!=='string')throw Error('PLATFORM_FEE_RPC_UNAVAILABLE');return result.result;
 };
}
