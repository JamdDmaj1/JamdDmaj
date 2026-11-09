// Server-only pre-signing preparation. No HTTP confirmation or custody grant.
import {planPhoenixOrder,clampPhoenixClosePlan,clampPhoenixEntryPlan} from './phoenix-market-plan.js';
import {requirePhoenixMarketQuote} from './phoenix-market-quote.js';
import {buildPhoenixUnsignedInstructions} from './phoenix-unsigned-instructions.js';
import {inspectPhoenixInstructionBindings} from './phoenix-instruction-bindings.js';
import {requireFreshPhoenixChainAccount} from './phoenix-chain-account.js';
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

export function requireFreshPhoenixOrderReview(review,{now=Date.now}={}){
  if(!reviews.has(review)||now()>=review.expiresAt)throw Error('PHOENIX_REVIEW_EXPIRED');
  requirePhoenixMarketQuote(review.quote,{symbol:review.plan.symbol,now:now()});
  if(review.account)requireFreshPhoenixChainAccount(review.account,{walletAddress:review.plan.walletAddress});
  return review;
}

// The client selects a native subaccount, never a quantity or close direction.
// Those come exclusively from a fresh, PDA-bound mainnet position read.
export async function preparePhoenixCloseReview(intent,{publicClient,readAccount,readSlot,now=Date.now}={}){
  if(!intent||typeof readAccount!=='function'||typeof readSlot!=='function'||!publicClient)throw Error('PHOENIX_REVIEW_INPUT');
  const {walletAddress,symbol,isolatedSubaccountIndex,clientOrderId}=intent;
  // Read the slow public quote first: the account proof expires after ten seconds,
  // so the chain read must happen immediately before it is verified.
  const [catalog,quote]=await Promise.all([publicClient.catalog(),publicClient.quote(symbol)]);
  const account=await readAccount({walletAddress,subaccountIndices:[isolatedSubaccountIndex]});
  const observedSlot=await readSlot();
  requirePhoenixMarketQuote(quote,{symbol,now:now()});
  requireFreshPhoenixChainAccount(account,{walletAddress});
  // The account read races the slot read: if it observed a newer slot, take a fresh
  // slot instead of rejecting a perfectly valid position.
  const slot=account.observedSlot>observedSlot?await readSlot():observedSlot;
  const market=catalog.markets.find(m=>m.symbol===symbol);
  const child=account.subaccounts.find(s=>s.subaccountIndex===isolatedSubaccountIndex);
  if(!market||!child?.exists||!child.authorityIsWallet)throw Error('PHOENIX_CLOSE_AUTHORITY');
  const position=child.positions.find(p=>p.assetId===market.assetId);
  if(!position||BigInt(position.baseLots)===0n||account.observedSlot>slot)throw Error('PHOENIX_CLOSE_POSITION');
  const base=BigInt(position.baseLots),plan=planPhoenixOrder({catalog,walletAddress,symbol,
    side:base>0n?'SHORT':'LONG',closeBaseLots:(base<0n?-base:base).toString(),
    referencePrice:quote.referencePrice,observedSlot:slot,clientOrderId,isolatedSubaccountIndex,now:now()});
  const review=Object.freeze({stage:'PHOENIX_CLOSE_REVIEW',readyForSigning:false,plan,quote,account,
    expiresAt:Math.min(plan.expiresAt,quote.expiresAt,account.observedAt+10000),
    sourcePositionSequence:position.sequence,marginLocation:'isolated-phoenix-account',withdrawalMayQueue:true});
  reviews.add(review);
  return requireFreshPhoenixOrderReview(review,{now});
}

export async function refreshPhoenixCloseReview(previous,deps){
 if(!reviews.has(previous)||!previous.plan.close)throw Error('PHOENIX_REVIEW_UNVERIFIED');
 const p=previous.plan,fresh=await preparePhoenixCloseReview({walletAddress:p.walletAddress,symbol:p.symbol,
  isolatedSubaccountIndex:p.isolatedSubaccountIndex,clientOrderId:p.packet.clientOrderId.toString()},deps);
 const review=Object.freeze({...fresh,plan:clampPhoenixClosePlan(fresh.plan,p)});reviews.add(review);return review;
}

export async function refreshPhoenixEntryReview(previous,deps){
 if(!reviews.has(previous)||previous.plan.close)throw Error('PHOENIX_REVIEW_UNVERIFIED');
 const p=previous.plan,fresh=await preparePhoenixOrderReview({walletAddress:p.walletAddress,symbol:p.symbol,side:p.side,
  marginUsdcUnits:p.marginUsdcUnits,leverageTenths:p.leverageTenths,isolatedSubaccountIndex:p.isolatedSubaccountIndex,
  clientOrderId:p.packet.clientOrderId.toString()},deps);
 const review=Object.freeze({...fresh,plan:clampPhoenixEntryPlan(fresh.plan,p)});reviews.add(review);return review;
}

export async function buildPhoenixReviewedInstructions(review,{client,exchangeKeys,now=Date.now}={}){
  const fresh=()=>requireFreshPhoenixOrderReview(review,{now});
  fresh();
  const pieces=await buildPhoenixUnsignedInstructions(review.plan,{client,now});
  fresh();
  const checked=await inspectPhoenixInstructionBindings(review.plan,pieces,{exchangeKeys,now});
  fresh();
  return checked;
}
