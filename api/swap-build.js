import { corsHeaders, jsonResponse } from '../lib/server.js';
import { createSolanaSwapBuildService } from '../lib/solana-swap-build.js';
import { enforceQuoteLimit } from './swap-quote.js';
export const config = { runtime:'edge' };

// Preparation only: no signatures, signed transactions, execute or submit API.
export function createHandler({ env=process.env, build, limit=enforceQuoteLimit }={}) {
  return async request => {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
    if(request.method!=='GET')return jsonResponse(request,{error:'METHOD_NOT_ALLOWED'},405);
    if(!env.JUPITER_API_KEY||!env.UPSTASH_REDIS_REST_URL||!env.UPSTASH_REDIS_REST_TOKEN)
      return jsonResponse(request,{error:'SWAP_NOT_CONFIGURED',executable:false},503);
    const params=new URL(request.url).searchParams;
    const allowed=['inputMint','outputMint','amount','taker','slippageBps'];
    if(request.url.length>800||[...params.keys()].some(key=>!allowed.includes(key))||allowed.some(key=>params.getAll(key).length!==1)
        || !/^[1-9][0-9]{0,2}$/.test(params.get('slippageBps')))
      return jsonResponse(request,{error:'INVALID_SWAP_REQUEST',executable:false},400);
    try {
      await limit(request);
      const prepare=build||createSolanaSwapBuildService({apiKey:env.JUPITER_API_KEY});
      const preparation=await prepare({...Object.fromEntries(params),slippageBps:Number(params.get('slippageBps'))});
      return jsonResponse(request,{ok:true,preparation});
    }catch(error){
      const limited=error?.status===429;
      return jsonResponse(request,{error:limited?'SWAP_RATE_LIMIT':'SWAP_PREPARATION_UNAVAILABLE',executable:false},limited?429:502);
    }
  };
}
export default createHandler();
