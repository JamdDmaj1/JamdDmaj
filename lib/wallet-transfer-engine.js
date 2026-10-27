// Locally constructed SOL/classic-SPL transfers only. No remote transaction
// builder, arbitrary instruction, key access, or implicit recipient conversion.
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {getProgramDerivedAddress} from '@solana/kit';
import {from64,to64} from './web-swap-policy.js';
import {tokenAmount,unsignedSwapWire} from './web-swap-evidence.js';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',grants=new WeakMap();
function fail(code='TRANSFER_REJECTED'){throw Error(code);}
function key(value){try{const b=bs58.decode(value);if(b.length!==32||bs58.encode(b)!==value)fail();return b;}catch{fail('TRANSFER_INVALID_ADDRESS');}}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return BigInt(n);}
const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
function u64(n){const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,n,true);return b;}
function system(a,missing=false){if(a===null&&missing)return 0n;if(!a||a.owner!==SYSTEM||a.executable!==false||!Array.isArray(a.data)||a.data[1]!=='base64'||from64(a.data[0],1).length!==0)fail('TRANSFER_INVALID_ADDRESS');return integer(a.lamports);}
function slot(r,min=0){const v=Number(integer(r?.context?.slot));if(v<min)fail();return v;}
export function transferAmountUnits(text,decimals){
 if(typeof text!=='string'||!Number.isInteger(decimals)||decimals<0||decimals>18||! /^(0|[1-9][0-9]{0,19})(\.[0-9]+)?$/.test(text))fail('TRANSFER_INVALID_AMOUNT');
 const [a,b='']=text.split('.');if(b.length>decimals)fail('TRANSFER_INVALID_AMOUNT');const n=BigInt(a)*10n**BigInt(decimals)+BigInt(b.padEnd(decimals,'0')||'0');
 if(n<=0n||n>18446744073709551615n)fail('TRANSFER_INVALID_AMOUNT');return String(n);
}
export async function consumeWalletTransferGrant(grant,wallet){const p=grants.get(grant);grants.delete(grant);if(!p||p.address!==wallet)fail('TRANSFER_APPROVAL_REQUIRED');await p.revalidate();return p;}
export function createWalletTransferEngine({rpc,journal,now=Date.now,isForeground=()=>true}={}){
 if(typeof rpc!=='function'||!journal)fail();const reviews=new WeakMap();let generation=0;
 const invalidate=()=>{generation++;};
 function current(p){if(p.generation!==generation||p.used||!isForeground()||now()<p.at||now()>=p.review.expiresAt)fail('TRANSFER_REVIEW_EXPIRED');}
 async function snapshot(p){
  if(await rpc('getGenesisHash',[])!==GENESIS)fail('TRANSFER_NETWORK_MISMATCH');
  const response=await rpc('getMultipleAccounts',[p.addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:p.slot}]);const observed=slot(response,p.slot),a=response.value;
  if(!Array.isArray(a)||a.length!==p.addresses.length)fail();const sol=system(a[0]);system(a[1],true);
  let input=sol,output=system(a[1],true),rent=0n;
  if(p.mint!=='SOL'){
   const m=a[2];if(!m||m.owner!==TOKEN||m.executable!==false||!Array.isArray(m.data)||m.data[1]!=='base64')fail('TRANSFER_UNSUPPORTED_TOKEN');
   const d=from64(m.data[0],83);if(d.length!==82||d[45]!==1||d[44]!==p.decimals)fail('TRANSFER_UNSUPPORTED_TOKEN');
   input=tokenAmount(a[3],p.wallet,p.mint);output=tokenAmount(a[4],p.recipient,p.mint,true);
   if((a[4]===null)!==p.createDestination)fail('TRANSFER_COST_CHANGED');
   if(p.createDestination)rent=integer(await rpc('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));
  }
  const valid=await rpc('isBlockhashValid',[p.blockhash,{commitment:'confirmed',minContextSlot:observed}]);slot(valid,observed);if(valid.value!==true)fail('TRANSFER_REVIEW_EXPIRED');
  const feeReply=await rpc('getFeeForMessage',[to64(p.message),{commitment:'confirmed',minContextSlot:observed}]);slot(feeReply,observed);const fee=integer(feeReply.value);
  if(fee<1n||fee>1000000n||rent>10000000n)fail();
  if(input<p.units||sol<fee+rent+(p.mint==='SOL'?p.units:0n))fail('TRANSFER_INSUFFICIENT_FUNDS');
  return {accounts:a,sol,input,output,fee,rent,slot:observed};
 }
 async function validate(p,signed){
  current(p);const before=await snapshot(p);current(p);
  if(p.fee!==undefined&&(p.fee!==before.fee||p.rent!==before.rent))fail('TRANSFER_COST_CHANGED');
  const r=await rpc('simulateTransaction',[signed||to64(unsignedSwapWire(p.message)),{encoding:'base64',sigVerify:!!signed,replaceRecentBlockhash:false,commitment:'confirmed',minContextSlot:before.slot,accounts:{encoding:'base64',addresses:p.addresses}}]);slot(r,before.slot);
  const a=r.value?.accounts;if(r.value?.err!==null||!Array.isArray(a)||a.length!==p.addresses.length)fail('TRANSFER_SIMULATION_FAILED');
  if(system(a[0])!==before.sol-before.fee-before.rent-(p.mint==='SOL'?p.units:0n))fail();
  if(p.mint==='SOL'){if(system(a[1])!==before.output+p.units)fail();}
  else{
   if(system(a[1],true)!==system(before.accounts[1],true)||JSON.stringify(a[2])!==JSON.stringify(before.accounts[2])
    ||tokenAmount(a[3],p.wallet,p.mint)!==before.input-p.units||tokenAmount(a[4],p.recipient,p.mint)!==before.output+p.units
    ||a[3].lamports!==before.accounts[3].lamports||BigInt(a[4].lamports)!==(p.createDestination?before.rent:BigInt(before.accounts[4].lamports)))fail();
  }
  if(await rpc('getGenesisHash',[])!==GENESIS)fail('TRANSFER_NETWORK_MISMATCH');current(p);return before;
 }
 async function prepare({payer,recipient,mint,amount}){
  invalidate();const ticket=generation;key(payer);key(recipient);if(payer===recipient)fail('TRANSFER_INVALID_ADDRESS');
  try{if(ed25519.Point.fromBytes(key(recipient)).isSmallOrder())fail();}catch{fail('TRANSFER_INVALID_ADDRESS');}
  if(await journal.read(payer))fail('TRANSFER_PENDING');if(await rpc('getGenesisHash',[])!==GENESIS)fail('TRANSFER_NETWORK_MISMATCH');
  const latest=await rpc('getLatestBlockhash',[{commitment:'confirmed'}]);const observed=slot(latest),blockhash=latest.value?.blockhash;key(blockhash);const height=String(integer(latest.value.lastValidBlockHeight));
  let addresses=[payer,recipient],decimals=9,createDestination=false,source,destination;
  if(mint!=='SOL'){
   key(mint);const derive=async owner=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[key(owner),key(TOKEN),key(mint)]}))[0];
   [source,destination]=await Promise.all([derive(payer),derive(recipient)]);addresses.push(mint,source,destination);
   const r=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:observed}]);slot(r,observed);const a=r.value;
   if(!Array.isArray(a)||a.length!==5||a[2]?.owner!==TOKEN||a[2].executable!==false||a[2].data?.[1]!=='base64')fail('TRANSFER_UNSUPPORTED_TOKEN');
   const d=from64(a[2].data[0],83);if(d.length!==82||d[45]!==1||d[44]>18)fail('TRANSFER_UNSUPPORTED_TOKEN');decimals=d[44];createDestination=a[4]===null;
  }
  const units=BigInt(transferAmountUnits(amount,decimals));let message;
  if(mint==='SOL'){
   const data=join(new Uint8Array([2,0,0,0]),u64(units));
   message=join(new Uint8Array([1,0,1,3]),key(payer),key(recipient),key(SYSTEM),key(blockhash),new Uint8Array([1,2,2,0,1,12]),data);
  }else{
   // payer/source/destination writable; recipient/mint/programs read-only.
   const keys=[payer,source,destination,recipient,mint,TOKEN,SYSTEM,ATA];if(new Set(keys).size!==8)fail('TRANSFER_INVALID_ADDRESS');
   const create=new Uint8Array([7,6,0,2,3,4,6,5,1,1]); // ATA create-idempotent
   const transfer=join(new Uint8Array([5,4,1,4,2,0,10,12]),u64(units),new Uint8Array([decimals]));
   message=join(new Uint8Array([1,0,5,8]),...keys.map(key),key(blockhash),new Uint8Array([createDestination?2:1]),...(createDestination?[create,transfer]:[transfer]));
  }
  const p={wallet:payer,recipient,mint,decimals,units,addresses,createDestination,message,blockhash,height,slot:observed,generation:ticket,used:false,at:now(),review:{expiresAt:now()+60000}};
  const evidence=await validate(p);p.fee=evidence.fee;p.rent=evidence.rent;
  const review=Object.freeze({address:payer,recipient,mint,decimals,input:String(units),fee:String(p.fee),rent:String(p.rent),expiresAt:p.review.expiresAt});p.review=review;reviews.set(review,p);return review;
 }
 function authorize(review,approval){const p=reviews.get(review);if(!p||approval!==true)fail('TRANSFER_APPROVAL_REQUIRED');current(p);const grant=Object.freeze({});grants.set(grant,{address:p.wallet,message:p.message.slice(),current:()=>current(p),revalidate:async()=>{if(await journal.read(p.wallet))fail('TRANSFER_PENDING');await validate(p);}});return grant;}
 async function submit(review,signed){const p=reviews.get(review);if(!p)fail();current(p);const wire=from64(signed,1233);
  if(wire.length!==65+p.message.length||wire[0]!==1||p.message.some((b,i)=>wire[i+65]!==b)||!ed25519.verify(wire.subarray(1,65),p.message,key(p.wallet),{zip215:false}))fail('TRANSFER_SIGNATURE_MISMATCH');
  await validate(p,signed);current(p);const signature=bs58.encode(wire.subarray(1,65));p.used=true;
  await journal.begin({address:p.wallet,signature,lastValidBlockHeight:p.height});
  if(!isForeground()||p.generation!==generation||now()>=p.review.expiresAt)fail('TRANSFER_PENDING');
  if(await rpc('sendTransaction',[signed,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}])!==signature)fail('TRANSFER_PENDING');return signature;
 }
 return Object.freeze({prepare,authorize,submit,invalidate});
}
