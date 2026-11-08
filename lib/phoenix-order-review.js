// Server-only pre-signing preparation. No HTTP confirmation or custody grant.
import {planPhoenixOrder} from './phoenix-market-plan.js';
import {requirePhoenixMarketQuote} from './phoenix-market-quote.js';
import {buildPhoenixUnsignedInstructions} from './phoenix-unsigned-instructions.js';
import {inspectPhoenixInstructionBindings} from './phoenix-instruction-bindings.js';
const reviews=new WeakSet();

export async function preparePhoenixOrderReview(intent, {publicClient, readSlot, now = Date.now} = {}) {
  if (!intent || !publicClient || typeof readSlot !== 'function') throw Error('PHOENIX_REVIEW_INPUT');
  // Only supported fields cross the boundary. A browser-supplied reference price,
  // catalog, fee or packet cannot override the server's native evidence.
  const {walletAddress, symbol, side, marginUsdcUnits, leverageTenths,
    clientOrderId, isolatedSubaccountIndex} = intent;
  if (intent.closeBaseLots !== undefined) throw Error('PHOENIX_REVIEW_NEEDS_POSITION_PROOF');
  const [catalog, quote, observedSlot] = await Promise.all([
    publicClient.catalog(), publicClient.quote(symbol), readSlot()
  ]);
  requirePhoenixMarketQuote(quote, {symbol, now: now()});
  const plan = planPhoenixOrder({catalog, walletAddress, symbol, side, marginUsdcUnits,
    leverageTenths, clientOrderId, isolatedSubaccountIndex,
    referencePrice: quote.referencePrice, observedSlot, now: now()});
  const review=Object.freeze({stage: 'PHOENIX_ORDER_REVIEW', readyForSigning: false,
    plan, quote, expiresAt: Math.min(plan.expiresAt, quote.expiresAt),
    marginLocation: 'isolated-phoenix-account', withdrawalMayQueue: true});
  reviews.add(review);
  return review;
}

export async function buildPhoenixReviewedInstructions(review,{client,exchangeKeys,now=Date.now}={}){
  const fresh=()=>{
    if(!reviews.has(review)||now()>=review.expiresAt)throw Error('PHOENIX_REVIEW_EXPIRED');
    requirePhoenixMarketQuote(review.quote,{symbol:review.plan.symbol,now:now()});
  };
  fresh();
  const pieces=await buildPhoenixUnsignedInstructions(review.plan,{client,now});
  fresh();
  const checked=await inspectPhoenixInstructionBindings(review.plan,pieces,{exchangeKeys,now});
  fresh();
  return checked;
}
