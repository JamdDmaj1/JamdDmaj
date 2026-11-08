// Pre-release TESTNET coordinator. No production exchange endpoint exists here.
import {createHyperliquidPublicClient,hlDecimal,hyperliquidAddress} from './hyperliquid-public.js';
import {planHyperliquidOrder,planHyperliquidConfiguration} from './hyperliquid-order-plan.js';
import {createHyperliquidTestnetExecutor} from './hyperliquid-testnet-executor.js';
import {reconcileHyperliquidOrder,reconcileHyperliquidConfiguration} from './hyperliquid-reconcile.js';
export function createHyperliquidValidationSession({provider,user,journal,client=createHyperliquidPublicClient({network:'testnet'}),now=Date.now,isCurrent=()=>true,random=()=>crypto.getRandomValues(new Uint8Array(16)),request}={}){
 user=hyperliquidAddress(user);if(!user||client.network!=='testnet')throw Error('hl-testnet-only');
 const cloid=()=>{const bytes=random();if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw Error('hl-random');return '0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
 async function snapshot(){const [catalog,account]=await Promise.all([client.markets(),client.account(user)]);if(!isCurrent())throw Error('hl-account-changed');return {catalog,account};}
 async function validatePlan(plan){const {catalog,account}=await snapshot(),market=catalog.markets.find(m=>m.symbol===plan.symbol);if([catalog,account].some(v=>!Number.isSafeInteger(v.observedAt)||v.observedAt>now()+2000||now()-v.observedAt>15000)||!market||market.assetId!==(plan.action?.asset??plan.order?.a)||plan.expiresAt<=now()||account.user!==plan.user||account.orders.some(o=>o.symbol===plan.symbol))return false;
  const p=account.positions.find(p=>p.symbol===plan.symbol);
  if(plan.close)return !!p&&p.size===plan.positionSize;
  if(p||market.delisted||plan.leverage>market.maxLeverage)return false;if(plan.operation==='CONFIGURE')return true;
  if(hlDecimal(account.withdrawable)<hlDecimal(plan.margin))return false;const active=await client.activeAsset(user,plan.symbol);return isCurrent()&&active.observedAt<=now()+2000&&now()-active.observedAt<=15000&&active.marginType==='isolated'&&active.leverage===plan.leverage;
 }
 const executor=createHyperliquidTestnetExecutor({provider,user,journal,lock:journal.lock,validatePlan,isCurrent,now,...(request?{request}:{})});
 return Object.freeze({
  async prepare({symbol,side,margin,leverage,close=false,configure=false}){const {catalog,account}=await snapshot(),params={catalog,account,symbol,side,margin,leverage,close,cloid:cloid(),now:now()};if(configure)return planHyperliquidConfiguration(params);if(!close){const active=await client.activeAsset(user,symbol);if(active.marginType!=='isolated'||active.leverage!==leverage)throw Error('hl-configure-isolated-first');}if(!isCurrent())throw Error('hl-account-changed');return planHyperliquidOrder(params);},
  confirm:(plan,consent)=>executor.submit(plan,{confirmed:consent===true}),
  async recover(){return journal.lock('jamd-hyperliquid-testnet-'+user,async()=>{const record=await journal.get(user);if(!record)return {stage:'NO_PENDING_OPERATION'};if(!isCurrent())throw Error('hl-account-changed');if(record.phase==='SIGNING'&&record.expiresAt<=now())await journal.put(user,{...record,phase:'NOT_SUBMITTED'});if(record.phase==='NOT_SUBMITTED'||record.phase==='SIGNING'&&record.expiresAt<=now()){await journal.release(user,record.cloid);return {stage:'NOT_SUBMITTED'};}
   let receipt;if(record.operation==='CONFIGURE')receipt=reconcileHyperliquidConfiguration(record,await client.activeAsset(user,record.symbol),now());else{const [status,fills,account]=await Promise.all([client.orderStatus(user,record.cloid),client.fills(user,Math.max(0,record.createdAt-2000)),client.account(user)]);receipt=reconcileHyperliquidOrder({record,status,fills,account,now:now()});}if(!isCurrent())throw Error('hl-account-changed');if(!receipt)return {stage:'CHECK_REQUIRED',cloid:record.cloid};await journal.release(user,record.cloid,receipt);return receipt;});},
  dispose:()=>executor.dispose()
 });
}
