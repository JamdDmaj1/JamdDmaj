// Shared display projection. Never a funding, signing or settlement authority.
import {selectedWalletAccount} from './wallet-portfolio-store.js';
const states=new WeakMap();
const address=v=>typeof v==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n;
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function emit(doc){const Type=doc.defaultView?.Event||globalThis.Event;if(Type)doc.dispatchEvent?.(new Type('jamd-trading-state'));}
export function validateWalletTradingSnapshot(value,account,now=Date.now()){
 if(!account||!value||value.stage!=='PUBLIC_WALLET_TRADING_STATE'||value.walletAddress!==account.address||value.network!=='solana-mainnet'
  ||value.readOnly!==true||!Number.isSafeInteger(value.observedAt)||now-value.observedAt>30000||value.observedAt>now+2000
  ||!Number.isSafeInteger(value.observedSlot)||value.observedSlot<0)throw Error('INVALID_WALLET_TRADING_STATE');
 for(const key of ['availableUsdcUnits','allocatedUsdUnits','payerLamports'])if(!units(value[key]))throw Error('INVALID_WALLET_TRADING_STATE');
 if(!Array.isArray(value.positions)||value.positions.length>6||!Array.isArray(value.orders)||value.orders.length>100
  ||!Array.isArray(value.history)||value.history.length>50||typeof value.ordersComplete!=='boolean'||typeof value.historyComplete!=='boolean')throw Error('INVALID_WALLET_TRADING_STATE');
 const positions=value.positions.map(p=>{
  if(!address(p.address)||!['SOL','ETH','BTC'].includes(p.asset)||!['LONG','SHORT'].includes(p.side)
   ||!units(p.sizeUsdUnits)||!units(p.collateralUsdUnits)||!units(p.priceUsdUnits)
   ||BigInt(p.sizeUsdUnits)===0n||BigInt(p.collateralUsdUnits)===0n||BigInt(p.priceUsdUnits)===0n)throw Error('INVALID_WALLET_TRADING_STATE');
  return {address:p.address,asset:p.asset,side:p.side,sizeUsdUnits:p.sizeUsdUnits,collateralUsdUnits:p.collateralUsdUnits,priceUsdUnits:p.priceUsdUnits};
 });
 if(new Set(positions.map(p=>p.address)).size!==positions.length)throw Error('INVALID_WALLET_TRADING_STATE');
 if(new Set(positions.map(p=>p.asset+':'+p.side)).size!==positions.length
  ||positions.reduce((sum,p)=>sum+BigInt(p.collateralUsdUnits),0n)!==BigInt(value.allocatedUsdUnits))throw Error('INVALID_WALLET_TRADING_STATE');
 const orders=value.orders.map(o=>{
  if(!address(o.address)||!['SL','TP','UNCLASSIFIED'].includes(o.kind))throw Error('INVALID_WALLET_TRADING_STATE');
  return {address:o.address,kind:o.kind};
 });
 if(new Set(orders.map(o=>o.address)).size!==orders.length)throw Error('INVALID_WALLET_TRADING_STATE');
 const history=value.history.map(h=>{
  if(typeof h.signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(h.signature)||!Number.isSafeInteger(h.slot)||h.slot<0
   ||!['confirmed','finalized'].includes(h.confirmation)||typeof h.failed!=='boolean'
   ||h.blockTime!==null&&(!Number.isSafeInteger(h.blockTime)||h.blockTime<0))throw Error('INVALID_WALLET_TRADING_STATE');
  return {signature:h.signature,slot:h.slot,confirmation:h.confirmation,failed:h.failed,blockTime:h.blockTime};
 });
 if(new Set(history.map(h=>h.signature)).size!==history.length)throw Error('INVALID_WALLET_TRADING_STATE');
 return freeze({stage:value.stage,walletAddress:account.address,network:value.network,readOnly:true,observedAt:value.observedAt,observedSlot:value.observedSlot,
  availableUsdcUnits:value.availableUsdcUnits,allocatedUsdUnits:value.allocatedUsdUnits,payerLamports:value.payerLamports,
  positions,orders,history,ordersComplete:value.ordersComplete,historyComplete:value.historyComplete});
}
export function publishWalletTradingState(doc,value,account,{pendingKnown=false,pending=[]}={}){
 if(selectedWalletAccount(doc)!==account)return false;
 const snapshot=value?validateWalletTradingSnapshot(value,account):null;
 // Keep only public operation metadata; never copy signed wire or packet JSON.
 if(typeof pendingKnown!=='boolean'||!Array.isArray(pending)||pending.length>100)throw Error('INVALID_PENDING_DISPLAY');
 const operations=pending.map(p=>{if(typeof p.id!=='string'||p.id.length>128||typeof p.state!=='string'||p.state.length>40)throw Error('INVALID_PENDING_DISPLAY');return {id:p.id,state:p.state};});
 const previous=states.get(doc);
 if(snapshot&&previous?.account===account&&previous.snapshot?.observedSlot>snapshot.observedSlot)return false;
 states.set(doc,{account,snapshot,pendingKnown,operations:freeze(operations)});emit(doc);return true;
}
export function currentWalletTradingState(doc,now=Date.now()){
 const s=states.get(doc),account=selectedWalletAccount(doc);
 if(!s||s.account!==account)return null;
 const fresh=s.snapshot&&now-s.snapshot.observedAt<=30000&&s.snapshot.observedAt<=now+2000;
 const blocked=account?.source==='watch'||!s.pendingKnown||s.operations.length>0||!s.snapshot?.ordersComplete||s.snapshot.orders.some(o=>o.kind==='UNCLASSIFIED');
 return freeze({account,snapshot:fresh?s.snapshot:null,stale:!fresh,pendingKnown:s.pendingKnown,operations:s.operations,
  // Pending operations may already be reflected on chain. Never subtract their
  // margins twice or pretend uncertain reservation amounts are zero.
  availableUsdcUnits:fresh&&!blocked?s.snapshot.availableUsdcUnits:null,reservationsKnown:s.pendingKnown&&s.operations.length===0});
}
