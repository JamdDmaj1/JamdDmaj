// Preparation for an explicit wallet prompt, not signing or submission itself.
// Never enable a trading UI solely because this endpoint returns a packet.
import {createHandler as createManualHandler} from './perps-review.js';
import {createWebPerpsReviewStore} from '../lib/perps-web-review-store.js';
import {createWebPerpsReviewCommand} from '../lib/perps-web-review-command.js';
import {createManualPerpsRelay} from '../lib/perps-manual-relay.js';
import {enforceQuoteLimit} from './swap-quote.js';
export function createHandler({env=process.env,fetchImpl=(...args)=>fetch(...args),command,now=Date.now,...options}={}){
 return createManualHandler({...options,env,fetchImpl,persistSigningReview:review=>{
  const store=createWebPerpsReviewStore({now,command:command||createWebPerpsReviewCommand({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN,fetchImpl})});
  return store.prepare(review);
 }});
}
// Public requests always use account-bound VPS policy/review storage. The
// legacy factory above is retained only for isolated inspection fixtures.
export default {fetch:createManualPerpsRelay({path:'/api/perps-signing-review',limit:enforceQuoteLimit})};
