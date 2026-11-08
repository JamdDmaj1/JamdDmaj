// Pre-release validation adapter. Mainnet signing is intentionally impossible.
// Browser wallet holds keys. No agent grant, withdrawal, bridge or deposit API.
import {ExchangeClient} from '@nktkas/hyperliquid';
import {hyperliquidAddress} from './hyperliquid-public.js';
import {isHyperliquidPlan} from './hyperliquid-order-plan.js';
export function createHyperliquidTestnetExecutor({provider,user,journal,lock,validatePlan,request=globalThis.fetch,now=Date.now,isCurrent=()=>true}){
 const owner=hyperliquidAddress(user);if(!owner||typeof provider?.request!=='function'||!journal?.put||!journal?.get||typeof lock!=='function'||typeof validatePlan!=='function')throw Error('hl-executor-config');
 let changed=false,disposed=false,revision=0;
 const invalidate=()=>{changed=true;revision++;};for(const event of ['accountsChanged','chainChanged','disconnect'])provider.on?.(event,invalidate);
 async function check(){if(changed||disposed||!isCurrent())throw Error('hl-account-changed');const ticket=revision,accounts=await provider.request({method:'eth_accounts'});if(ticket!==revision||changed||disposed||hyperliquidAddress(accounts?.[0])!==owner||!isCurrent())throw Error('hl-account-changed');}
 return Object.freeze({
  async submit(plan,{confirmed=false}={}){
   // This is not a runtime URL/env switch. Production enabling needs a separate
   // reviewed adapter and witnessed open/read/close/reconcile verification.
   if(plan?.network!=='testnet'||plan.venue!=='hyperliquid'||plan.user!==owner)throw Error('hl-testnet-only');
   const configure=plan.operation==='CONFIGURE',cloid=configure?plan.cloid:plan.order?.c;
   if(!isHyperliquidPlan(plan)||!confirmed||plan.expiresAt<=now()||plan.expiresAt>now()+15000||plan.slippageBps!==50||(!configure&&plan.order?.t?.limit?.tif!=='Ioc')||!/^0x[0-9a-f]{32}$/.test(cloid))throw Error('hl-review-required');
   return lock('jamd-hyperliquid-testnet-'+owner,async()=>{
    await check();if(await journal.get(owner))throw Error('hl-pending-operation');if(await validatePlan(plan)!==true)throw Error('hl-live-review-required');await check();
    const record={network:'testnet',user:owner,cloid,symbol:plan.symbol,operation:configure?'CONFIGURE':'ORDER',leverage:plan.leverage,positionSize:plan.positionSize??null,phase:'SIGNING',createdAt:now(),expiresAt:plan.expiresAt,...(configure?{action:plan.action}:{order:plan.order})};
    await journal.put(owner,record);let sendStarted=false;
    try{
     const wallet={address:owner,async signTypedData(data){await check();if(now()>=plan.expiresAt)throw Error('hl-review-expired');if(data.domain?.name!=='Exchange'||data.domain?.chainId!==1337||data.primaryType!=='Agent'||data.message?.source!=='b')throw Error('hl-testnet-signature-only');const signature=await provider.request({method:'eth_signTypedData_v4',params:[owner,JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v)]});await check();return signature;}};
     const transport={isTestnet:true,async request(endpoint,payload){await check();const expected=configure?{type:'updateLeverage',...plan.action}:{type:'order',orders:[plan.order],grouping:'na'};if(endpoint!=='exchange'||JSON.stringify(payload.action)!==JSON.stringify(expected)||payload.expiresAfter!==plan.expiresAt||now()>=plan.expiresAt)throw Error('hl-action-mismatch');
      await journal.put(owner,{...record,phase:'SUBMITTING'});sendStarted=true;
      const response=await request('https://api.hyperliquid-testnet.xyz/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('hl-submission-uncertain');return response.json();}};
     const exchange=new ExchangeClient({transport,wallet,nonceManager:()=>journal.nonce?journal.nonce(owner,now()):now(),defaultExpiresAfter:plan.expiresAt});
     const result=configure?await exchange.updateLeverage(plan.action):await exchange.order({orders:[plan.order],grouping:'na'});
     // An HTTP success/fill response is NOT reconciled position/account state.
     await journal.put(owner,{...record,phase:'CHECK_REQUIRED'});return {stage:'CHECK_REQUIRED',cloid:record.cloid,response:result};
    }catch(error){await journal.put(owner,{...record,phase:sendStarted?'UNCERTAIN':'NOT_SUBMITTED'});throw error;}
   });
  },
  dispose(){disposed=true;revision++;for(const event of ['accountsChanged','chainChanged','disconnect'])provider.removeListener?.(event,invalidate);}
 });
}
