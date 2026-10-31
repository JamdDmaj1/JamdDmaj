import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
// Only Devnet reads. A submitted signature is not proof of successful creation.
export const FAIR_DEVNET_RPC='https://api.devnet.solana.com';
export function assertFairLaunchMessage(original,signed){
 const a=original?.messageBytes,b=signed?.messageBytes;
 if(!(a instanceof Uint8Array)||!(b instanceof Uint8Array)||a.length!==b.length||a.some((x,i)=>x!==b[i]))throw Error('FAIR_WALLET_TRANSACTION_CHANGED');
}
export function fairLaunchOwnerSignature(transaction,owner){
 try{const s=transaction.signatures[owner];if(!(s instanceof Uint8Array)||s.length!==64||!ed25519.verify(s,transaction.messageBytes,bs58.decode(owner),{zip215:false}))throw Error();return bs58.encode(s);}catch{throw Error('FAIR_SIGNATURE_INVALID');}
}
export async function readFairLaunchTransaction(signature,{fetchImpl=globalThis.fetch}={}){
 if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature||''))throw Error('FAIR_SIGNATURE_INVALID');
 const r=await fetchImpl(FAIR_DEVNET_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignatureStatuses',params:[[signature],{searchTransactionHistory:true}]}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('FAIR_STATUS_UNAVAILABLE');
 const value=await r.json();if(value.error||!Array.isArray(value.result?.value)||value.result.value.length!==1)throw Error('FAIR_STATUS_UNAVAILABLE');
 const status=value.result.value[0];
 if(status===null)return {state:'pending',signature};
 if(!status||!Object.hasOwn(status,'err'))throw Error('FAIR_STATUS_UNAVAILABLE');
 if(status.err!==null)return {state:'failed',signature};
 return {state:['confirmed','finalized'].includes(status.confirmationStatus)?'confirmed':'pending',signature};
}
const KEY='jamd.fairLaunch.pending.v1';
export function fairLaunchRecovery(storage){
 return {
  read(){const raw=storage.getItem(KEY);if(!raw)return null;const r=JSON.parse(raw);if(r?.cluster!=='solana:devnet'||!['create','liquidity'].includes(r.kind)||!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(r.signature||''))throw Error('FAIR_RECOVERY_INVALID');return r;},
  save({signature,kind,mintAddress,policyAddress}){if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature||'')||!['create','liquidity'].includes(kind))throw Error('FAIR_RECOVERY_INVALID');const r={cluster:'solana:devnet',signature,kind,mintAddress,policyAddress};storage.setItem(KEY,JSON.stringify(r));if(storage.getItem(KEY)!==JSON.stringify(r))throw Error('FAIR_RECOVERY_STORAGE');},
  clear(signature){if(this.read()?.signature===signature)storage.removeItem(KEY);}
 };
}
