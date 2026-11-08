// Locally compiled legacy Solana wire: one wallet signer, exact checked native
// instructions and bounded compute fees. No arbitrary lookup tables, builder
// transaction, signature, broadcast or Jupiter signing-policy changes.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {phoenixKey} from './phoenix-market-plan.js';
import {requireFreshPhoenixOrderReview,buildPhoenixReviewedInstructions} from './phoenix-order-review.js';

const COMPUTE='ComputeBudget111111111111111111111111111111';
const wires=new WeakMap();
const fail=()=>{throw Error('PHOENIX_UNSIGNED_WIRE');};
function shortvec(value){
 if(!Number.isSafeInteger(value)||value<0||value>65535)fail();
 const result=[];do{let n=value&127;value>>>=7;if(value)n|=128;result.push(n);}while(value);
 return Buffer.from(result);
}

export async function buildPhoenixOrderWire(review,{client,exchangeKeys,blockhash,lastValidBlockHeight,
 computeUnitLimit=600000,computeUnitPriceMicroLamports=1000,now=Date.now}={}){
 requireFreshPhoenixOrderReview(review,{now});phoenixKey(blockhash);
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1||
    !Number.isInteger(computeUnitLimit)||computeUnitLimit<100000||computeUnitLimit>1400000||
    !Number.isInteger(computeUnitPriceMicroLamports)||computeUnitPriceMicroLamports<0||computeUnitPriceMicroLamports>10000)fail();
 const checked=await buildPhoenixReviewedInstructions(review,{client,exchangeKeys,now});
 const wallet=review.plan.walletAddress;
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(computeUnitLimit,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(BigInt(computeUnitPriceMicroLamports),1);
 const instructions=[{programAddress:COMPUTE,accounts:[],data:limit},{programAddress:COMPUTE,accounts:[],data:price},...checked.instructions];
 const roles=new Map([[wallet,3]]),programs=new Set();
 for(const ix of instructions){
  programs.add(ix.programAddress);
  if(!roles.has(ix.programAddress))roles.set(ix.programAddress,0);
  for(const a of ix.accounts){
   if(![0,1,2,3].includes(a.role)||(a.role&2)!==0&&a.address!==wallet)fail();
   roles.set(a.address,(roles.get(a.address)??0)|a.role);
  }
 }
 for(const program of programs)if(roles.get(program)!==0)fail();
 const writable=[wallet,...[...roles].filter(([a,r])=>a!==wallet&&(r&1)!==0).map(([a])=>a)];
 const readonly=[...roles].filter(([a,r])=>a!==wallet&&(r&1)===0).map(([a])=>a);
 const keys=[...writable,...readonly];
 if(keys.length>64||new Set(keys).size!==keys.length)fail();
 const compiled=instructions.map(ix=>{
  const data=Buffer.from(ix.data);
  if(data.length>512||ix.accounts.length>64)fail();
  return Buffer.concat([Buffer.from([keys.indexOf(ix.programAddress)]),shortvec(ix.accounts.length),
   Buffer.from(ix.accounts.map(a=>keys.indexOf(a.address))),shortvec(data.length),data]);
 });
 const message=Buffer.concat([Buffer.from([1,0,readonly.length]),shortvec(keys.length),
  ...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(blockhash)),shortvec(compiled.length),...compiled]);
 const wire=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]);
 if(wire.length>1232)throw Error('PHOENIX_WIRE_TOO_LARGE');
 requireFreshPhoenixOrderReview(review,{now});
 const result=Object.freeze({stage:'PHOENIX_UNSIGNED_WIRE',readyForSigning:false,walletAddress:wallet,
  venue:'phoenix',symbol:review.plan.symbol,close:review.plan.close,blockhash,lastValidBlockHeight,
  computeUnitLimit,computeUnitPriceMicroLamports,
  maximumPriorityFeeLamports:((BigInt(computeUnitLimit)*BigInt(computeUnitPriceMicroLamports)+999999n)/1000000n).toString(),
  messageBase64:message.toString('base64'),serializedTxBase64:wire.toString('base64'),
  messageHash:createHash('sha256').update(message).digest('hex'),expiresAt:review.expiresAt,
  requiresSameWireSimulation:true,requiresDurableOwnerConsent:true});
 wires.set(result,{review,checked,now});return result;
}

export function requirePhoenixUnsignedWire(value){
 const p=wires.get(value);if(!p)fail();
 requireFreshPhoenixOrderReview(p.review,{now:p.now});
 return Object.freeze({review:p.review,checked:p.checked,wire:value});
}
