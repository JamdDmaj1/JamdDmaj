// Terminal order identity + fills + fresh position state. unknownOid/timeout
// never authorizes a retry or erases a pending hold.
import {hlDecimal as decimal,hlFormat} from './hyperliquid-public.js';
const receipts=new WeakSet();
export const isHyperliquidReceipt=value=>!!value&&receipts.has(value);
export function reconcileHyperliquidConfiguration(record,active,now=Date.now()){
 if(record?.operation!=='CONFIGURE'||record.network!=='testnet'||active?.network!=='testnet'||active.user!==record.user||active.symbol!==record.symbol||now-active.observedAt>15000||active.observedAt>now+2000||active.marginType!=='isolated'||active.leverage!==record.leverage)return null;
 const receipt=Object.freeze({network:'testnet',user:record.user,cloid:record.cloid,reconciled:true,stage:'CONFIGURED'});receipts.add(receipt);return receipt;
}
export function reconcileHyperliquidOrder({record,status,fills,account,now=Date.now()}){
 if(record?.network!=='testnet'||account?.network!=='testnet'||account.user!==record.user||!Number.isSafeInteger(account.observedAt)||now-account.observedAt>15000||account.observedAt>now+2000||!Array.isArray(fills)||fills.length>=2000)throw Error('hl-reconcile-required');
 if(status?.status!=='order')return null;const native=status.order?.order,terminal=status.order?.status;
 if(!['filled','canceled','rejected','marginCanceled','reduceOnlyCanceled','iocCancelRejected'].includes(terminal))return null;
 const order=record.order;if(!native||native.cloid!==record.cloid||native.coin!==record.symbol||native.side!==(order.b?'B':'A')||!Number.isSafeInteger(native.oid)||decimal(native.origSz)!==decimal(order.s))throw Error('hl-order-identity');
 let filled=0n;const seen=new Set();for(const f of fills.filter(f=>f.oid===native.oid)){
  if(f.coin!==record.symbol||f.side!==(order.b?'B':'A')||!Number.isSafeInteger(f.tid)||seen.has(f.tid)||!Number.isSafeInteger(f.time)||f.time<record.createdAt-2000||f.time>now+2000)throw Error('hl-fill-identity');seen.add(f.tid);filled+=decimal(f.sz);
 }
 if(filled>decimal(order.s)||terminal==='filled'&&filled!==decimal(order.s))throw Error('hl-incomplete-fills');
 const remaining=decimal(native.sz);if(terminal!=='filled'&&decimal(native.origSz)-remaining!==filled)throw Error('hl-incomplete-fills');
 const before=record.positionSize==null?0n:decimal(record.positionSize,{signed:true}),expected=before+(order.b?filled:-filled),actual=account.positions.find(p=>p.symbol===record.symbol);
 if((actual?decimal(actual.size,{signed:true}):0n)!==expected||account.orders.some(o=>o.symbol===record.symbol))return null;
 const receipt=Object.freeze({network:'testnet',user:record.user,cloid:record.cloid,reconciled:true,filledSize:hlFormat(filled),stage:filled===0n?'NOT_FILLED':filled===decimal(order.s)?'FILLED':'PARTIALLY_FILLED',positionRemains:expected!==0n});receipts.add(receipt);return receipt;
}
