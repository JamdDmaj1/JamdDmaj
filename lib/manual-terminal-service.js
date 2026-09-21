import {reviewManualOrder} from './manual-order-draft.js';
import {preflightManualOrder} from './manual-order-preflight.js';
import {requireManualConfirmation,enqueueManualOrder} from './manual-order-queue.js';
const QUEUE='jamd:pro:executor:manual-test';
const PREFIX='jamd:pro:terminal:review:';

function capability(state){
 const e=state?.executor;
 if(e?.terminalOrderVersion!==1||e?.marginMode!=='isolated'||e?.productType!=='USDT-FUTURES')throw new Error('Update the VPS terminal protocol before submitting orders.');
}
function checked(input,quote,state,now){
 capability(state);
 const review=preflightManualOrder(input,quote,state,now);
 if(review.blockers.length)throw new Error('Order blocked: '+review.blockers.join(', '));
 return review;
}

// Dependencies are explicit so integration tests cannot contact an exchange.
export function manualTerminalService({redis,getState,getQuote,enabled,now=Date.now,newId=()=>crypto.randomUUID()}){
 const requireEnabled=()=>{if(enabled!==true)throw new Error('Live manual order submission is not enabled.');};
 return {
  async prepare(input){
   requireEnabled();const draft=reviewManualOrder(input);
   const [state,quote]=await Promise.all([getState(),getQuote(draft.symbol)]);
   const review=checked(draft,quote,state,now());
   const requestId=newId();requireManualConfirmation({requestId,confirmLiveOrder:true});
   const payload={requestId,draft:review.draft,expiresAt:now()+60000};
   const saved=await redis('pipeline',[['SET',PREFIX+requestId,JSON.stringify(payload),'NX','EX',60]]);
   if(saved?.[0]?.result!=='OK')throw new Error('Could not save confirmation. No order submitted.');
   return {...payload,submitted:false};
  },
  async confirm(input){
   requireEnabled();const requestId=requireManualConfirmation(input);
   const stored=await redis('pipeline',[['GET',PREFIX+requestId]]);
   const payload=JSON.parse(stored?.[0]?.result||'null');
   if(!payload||payload.requestId!==requestId||!Number.isFinite(payload.expiresAt)||payload.expiresAt<=now())throw new Error('Confirmation expired; review again.');
   const [state,quote]=await Promise.all([getState(),getQuote(payload.draft.symbol)]);
   checked(payload.draft,quote,state,now());
   const draft=payload.draft,createdAt=new Date(now()).toISOString(),validUntil=new Date(Math.min(payload.expiresAt,now()+60000)).toISOString();
   const signal={id:'manual-terminal-'+requestId,pair:draft.symbol,symbol:draft.symbol,side:draft.side,
    entry:draft.reference,currentPrice:draft.reference,sl:draft.stop,tp1:draft.take,tp2:draft.take,tp3:draft.take,
    plannedUsd:draft.margin,leverage:draft.leverage,manualTest:true,executorSource:'manual-test',terminalOrderVersion:1,
    marginMode:'isolated',orderType:'market',createdAt,validUntil,status:'OPEN',reasons:['Explicit owner terminal confirmation']};
   await enqueueManualOrder(redis,QUEUE,requestId,{id:signal.id,requestedAt:createdAt,expiresAt:validUntil,signal});
   return {requestId,signalId:signal.id,status:'queued',filled:false,note:'Queued for VPS checks; not an exchange fill.'};
  }
 };
}
